import * as THREE from 'three';
import { sfx } from './audio.js';

const EYE = 1.65;
const GRAV = 26;
const DODGE_TIME = 0.24;
const DODGE_SPEED = 19;
const IFRAMES = 0.32;
export const PERFECT_DODGE_WINDOW = 0.2;

function buildWeaponMesh(weapon) {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: weapon.color, metalness: 0.8, roughness: 0.25, emissive: weapon.color, emissiveIntensity: 0.08 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.9 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a040, metalness: 0.9, roughness: 0.3 });
  const make = (side = 1) => {
    const w = new THREE.Group();
    if (weapon.id === 'martelo') {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 1.1, 8), grip);
      handle.position.y = 0.35; w.add(handle);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.24), metal);
      head.position.y = 0.9; w.add(head);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 6), gold);
      spike.position.y = 1.1; w.add(spike);
    } else {
      const len = weapon.id === 'adagas' ? 0.5 : 0.95;
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 8), grip);
      w.add(handle);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(weapon.id === 'adagas' ? 0.14 : 0.26, 0.04, 0.06), gold);
      guard.position.y = 0.12; w.add(guard);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.07, len, 0.015), metal);
      blade.position.y = 0.14 + len / 2; w.add(blade);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 4), metal);
      tip.position.y = 0.14 + len + 0.06; tip.rotation.y = Math.PI / 4; tip.scale.z = 0.3; w.add(tip);
    }
    w.userData.side = side;
    return w;
  };
  const right = make(1);
  g.add(right);
  g.userData.right = right;
  if (weapon.id === 'adagas') {
    const left = make(-1);
    g.add(left);
    g.userData.left = left;
  }
  return g;
}

export class Player {
  constructor(camera, weapon, stats) {
    this.camera = camera;
    this.weapon = weapon;
    this.stats = stats;
    this.pos = new THREE.Vector3(0, 0, 10);
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.radius = 0.45;
    this.hp = stats.maxHp;
    this.dashCharges = this.maxDash();
    this.dashTimer = 0;
    this.dodgeT = -1; // tempo desde o início da esquiva
    this.dodgeDir = new THREE.Vector3();
    this.iframes = 0;
    this.parryT = -1; // tempo desde o início do aparo
    this.parryCooldown = 0;
    this.attackT = -1;
    this.attackDone = false;
    this.combo = 0;
    this.comboTimer = 0;
    this.queuedAttack = false;
    this.critNext = false;
    this.fury = 0;
    this.hurtCooldown = 0;
    this.grounded = true;
    this.bob = 0;
    this.roll = 0;
    this.parryFlash = 0;
    this.dead = false;

    this.view = buildWeaponMesh(weapon);
    camera.add(this.view);
    this.restPos = new THREE.Vector3(0.42, -0.46, -0.75);
    this.view.scale.setScalar(0.75);
    this.view.position.copy(this.restPos);
  }

  maxDash() { return this.stats.dashCharges + (this.weapon.dashBonus || 0); }
  parryWindow() { return this.weapon.parryWindow * this.stats.parryWindowMult; }
  isParrying() { return this.parryT >= 0 && this.parryT <= this.parryWindow(); }
  isInvulnerable() { return this.iframes > 0; }
  isPerfectDodge() { return this.dodgeT >= 0 && this.dodgeT <= PERFECT_DODGE_WINDOW; }
  eye() { return new THREE.Vector3(this.pos.x, this.pos.y + EYE, this.pos.z); }
  forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  heal(n) { this.hp = Math.min(this.stats.maxHp, this.hp + n); }
  attackSwingTime() { return this.weapon.swingTime / this.stats.attackSpeed; }

  update(dt, input, game) {
    const [mdx, mdy] = input.takeMouse();
    const s = 0.0022 * input.sensitivity;
    this.yaw -= mdx * s;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - mdy * s));

    // Recarga das esquivas
    const maxD = this.maxDash();
    if (this.dashCharges < maxD) {
      this.dashTimer += dt;
      if (this.dashTimer >= this.stats.dashRecharge) { this.dashTimer = 0; this.dashCharges++; }
    } else this.dashTimer = 0;

    // Movimento
    const f = this.forward();
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const wish = new THREE.Vector3();
    if (input.down('KeyW')) wish.add(f);
    if (input.down('KeyS')) wish.sub(f);
    if (input.down('KeyD')) wish.add(r);
    if (input.down('KeyA')) wish.sub(r);
    if (wish.lengthSq() > 0) wish.normalize();

    const attacking = this.attackT >= 0;
    const speed = 7.2 * this.stats.moveSpeed * (attacking ? 0.55 : 1) * (this.parryT >= 0 && this.parryT < 0.3 ? 0.6 : 1);

    if (input.consume('ShiftLeft') || input.consume('ShiftRight') || input.consume('KeyQ')) this.tryDodge(wish.lengthSq() > 0 ? wish : f.clone().negate());

    if (this.dodgeT >= 0) {
      this.dodgeT += dt;
      if (this.dodgeT < DODGE_TIME) {
        const k = 1 - this.dodgeT / DODGE_TIME;
        this.pos.addScaledVector(this.dodgeDir, DODGE_SPEED * (0.4 + k) * dt);
      }
      if (this.dodgeT > 0.5) this.dodgeT = -1;
    }
    if (!(this.dodgeT >= 0 && this.dodgeT < DODGE_TIME)) {
      const accel = this.grounded ? 14 : 4;
      this.vel.x += (wish.x * speed - this.vel.x) * Math.min(1, accel * dt);
      this.vel.z += (wish.z * speed - this.vel.z) * Math.min(1, accel * dt);
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
    }
    this.iframes = Math.max(0, this.iframes - dt);

    // Pulo e gravidade
    if (input.consume('Space') && this.grounded) { this.vy = 8.5; this.grounded = false; sfx.jump(); }
    this.vy -= GRAV * dt;
    this.pos.y += this.vy * dt;
    if (this.pos.y <= 0) { this.pos.y = 0; this.vy = 0; this.grounded = true; }

    game.room.collide(this.pos, this.radius);

    // Aparo
    if (this.parryCooldown > 0) this.parryCooldown -= dt;
    if ((input.consume('Mouse2') || input.consume('KeyF')) && this.parryCooldown <= 0 && this.dodgeT < 0) {
      this.parryT = 0;
      this.parryCooldown = 0.42;
      this.attackT = -1; // aparo cancela ataque
      this.queuedAttack = false;
      sfx.parryWhiff();
    }
    if (this.parryT >= 0) {
      this.parryT += dt;
      if (this.parryT > 0.35) this.parryT = -1;
    }

    // Ataque
    if (input.consume('Mouse0')) {
      if (this.attackT < 0 && this.parryT < 0) this.startAttack();
      else this.queuedAttack = true;
    }
    if (this.attackT >= 0) {
      const st = this.attackSwingTime();
      this.attackT += dt;
      if (!this.attackDone && this.attackT >= st * this.weapon.activeAt) {
        this.attackDone = true;
        game.playerStrike(this.combo);
      }
      if (this.attackT >= st) {
        this.attackT = -1;
        this.comboTimer = 0.45;
        this.combo = (this.combo + 1) % 3;
        if (this.queuedAttack) { this.queuedAttack = false; this.startAttack(); }
      }
    } else if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }
    if (this.hurtCooldown > 0) this.hurtCooldown -= dt;
    this.parryFlash = Math.max(0, this.parryFlash - dt * 4);

    this.updateCamera(dt, wish.lengthSq() > 0);
  }

  tryDodge(dir) {
    if (this.dashCharges <= 0 || this.dodgeT >= 0) return;
    this.dashCharges--;
    this.dodgeT = 0;
    this.dodgeId = (this.dodgeId || 0) + 1;
    this.iframes = IFRAMES;
    this.dodgeDir.copy(dir).setY(0).normalize();
    this.attackT = -1; this.queuedAttack = false;
    this.parryT = -1;
    sfx.dodge();
  }

  startAttack() {
    this.attackT = 0;
    this.attackDone = false;
    sfx.swing();
  }

  updateCamera(dt, moving) {
    const cam = this.camera;
    cam.position.set(this.pos.x, this.pos.y + EYE, this.pos.z);
    // Inclinação lateral durante a esquiva
    let targetRoll = 0;
    if (this.dodgeT >= 0 && this.dodgeT < DODGE_TIME) {
      const r = new THREE.Vector3(-this.forward().z, 0, this.forward().x);
      targetRoll = -this.dodgeDir.dot(r) * 0.12;
    }
    this.roll += (targetRoll - this.roll) * Math.min(1, dt * 12);
    cam.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    const targetFov = (this.dodgeT >= 0 && this.dodgeT < DODGE_TIME) ? 86 : 75;
    cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 10);
    cam.updateProjectionMatrix();

    // Viewmodel
    if (moving && this.grounded) this.bob += dt * 10;
    const bx = Math.sin(this.bob) * 0.015, by = Math.abs(Math.cos(this.bob)) * 0.02;
    const v = this.view;
    const right = v.userData.right, left = v.userData.left;
    v.position.set(this.restPos.x + bx, this.restPos.y + by, this.restPos.z);
    right.rotation.set(-0.75, 0.15, -0.55);
    right.position.set(0, 0, 0);
    if (left) { left.position.set(-1.0, 0, 0); left.rotation.set(-0.75, -0.15, 0.55); }

    if (this.attackT >= 0) {
      const k = Math.min(1, this.attackT / this.attackSwingTime());
      const e = k < 0.3 ? -k / 0.3 * 0.3 : (k - 0.3) / 0.7; // antecipação → golpe
      const swingSide = (this.combo % 2 === 0) ? 1 : -1;
      const target = (left && this.combo % 2 === 1) ? left : right;
      const sweep = Math.sin(Math.min(1, Math.max(-0.3, e)) * Math.PI * 0.5);
      if (this.combo === 2) {
        // Golpe vertical
        target.rotation.set(-0.3 - sweep * 1.9 + 0.8, 0, 0);
        target.position.set(left ? 0.38 : -0.1, 0.25 - sweep * 0.3, -0.1);
        if (left) { left.rotation.copy(target.rotation); left.position.set(-1.05, 0.25 - sweep * 0.3, -0.1); }
      } else {
        target.rotation.set(-1.3, 0, swingSide * (1.2 - sweep * 2.6));
        target.position.set(swingSide * (0.15 - sweep * 0.5) + (target === left ? -0.6 : 0), 0.1, -0.15);
      }
    } else if (this.parryT >= 0) {
      const k = Math.min(1, this.parryT / 0.08);
      right.rotation.set(-0.2, 0, -0.25 + k * 1.75);
      right.position.set(-0.3 * k, 0.28 * k, -0.05 * k);
      if (left) { left.rotation.set(-0.2, 0, 0.25 - k * 1.75); left.position.set(-1.0 + 0.45 * k, 0.28 * k, 0); }
    }
    if (this.parryFlash > 0) v.position.z += this.parryFlash * 0.08;
  }

  dispose() { this.camera.remove(this.view); }
}

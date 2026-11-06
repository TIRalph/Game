import * as THREE from 'three';
import { sfx } from './audio.js';
import { CLASSES } from './data.js';
import { createCharacter, createFirstPersonHands } from './models.js';

const EYE = 1.65;
const GRAV = 26;
const DODGE_TIME = 0.24;
const IFRAMES = 0.32;
export const PERFECT_DODGE_WINDOW = 0.2;

// ---------------------------------------------------------------------------
// Câmera em primeira pessoa (Mago): mãos presas à câmera.
// ---------------------------------------------------------------------------
class FirstPersonView {
  constructor(player, camera, showHands) {
    this.p = player; this.camera = camera;
    this.hands = showHands ? createFirstPersonHands(player.cls.model, { glow: player.cls.color }) : null;
    if (this.hands) camera.add(this.hands.root);
    this.roll = 0;
    this.lastAttack = -1;
  }

  muzzle(combo) {
    const v = new THREE.Vector3();
    if (!this.hands) return this.p.eye();
    this.hands.socket(combo === 1 ? 'handL' : 'handR').getWorldPosition(v);
    return v;
  }

  update(dt, moving) {
    const p = this.p, cam = this.camera;
    cam.position.set(p.pos.x, p.pos.y + EYE, p.pos.z);
    let targetRoll = 0;
    if (p.isDashing()) {
      const f = p.forward();
      targetRoll = -p.dodgeDir.dot(new THREE.Vector3(-f.z, 0, f.x)) * 0.12;
    }
    this.roll += (targetRoll - this.roll) * Math.min(1, dt * 12);
    cam.rotation.set(p.pitch, p.yaw, this.roll, 'YXZ');
    const fov = p.isDashing() ? 86 : 75;
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 10);
    cam.updateProjectionMatrix();

    const h = this.hands;
    if (!h) return;
    if (p.stormT > 0) { if (h.state !== 'cast3' || h.t > 0.3) h.play('cast3', { duration: 0.3 }); }
    else if (p.attackT >= 0) {
      if (this.lastAttack !== p.attackId) { this.lastAttack = p.attackId; h.play('cast' + (p.combo + 1), { duration: p.attackSwingTime() }); }
    } else if (p.parryT >= 0) { if (h.state !== 'parry') h.play('parry', { duration: 0.35 }); }
    else if (p.isDashing()) h.play('dodge', { duration: DODGE_TIME });
    else h.play('idle');
    h.update(dt, { speed: moving && p.grounded ? 1 : 0 });
  }

  onHurt() {}
  dispose() { if (this.hands) this.hands.dispose(); }
}

// ---------------------------------------------------------------------------
// Câmera em terceira pessoa (Punhos): câmera de ombro que orbita o personagem.
// ---------------------------------------------------------------------------
class ThirdPersonView {
  constructor(player, camera, scene) {
    this.p = player; this.camera = camera;
    this.body = createCharacter(player.cls.model, { height: 1.8, fighter: true, color: 0x3a3048, skin: 0xd9a882, gloveColor: 0xb04a2a, eyeColor: 0x9ad0ff, hood: 0x6a3a2a });
    scene.add(this.body.root);
    this.dist = 4.2;
    this.lastAttack = -1;
    this.shoulder = 0.65;
  }

  muzzle() { return this.p.eye(); }

  update(dt, moving, room) {
    const p = this.p, cam = this.camera;
    const b = this.body;
    b.root.position.copy(p.pos);
    b.root.rotation.y = p.facing;

    // Animação
    if (p.dead) b.play('death', { duration: 0.8 });
    else if (p.flurryT > 0) {
      const beat = Math.floor(p.flurryT / 0.09);
      if (beat !== this.beat) { this.beat = beat; b.play(beat % 2 ? 'attack1' : 'attack2', { duration: 0.09 }); }
    } else if (p.dragonT > 0) { if (b.state !== 'lunge') b.play('lunge', { duration: 0.3 }); }
    else if (p.isDashing()) { if (b.state !== 'dodge') b.play('dodge', { duration: DODGE_TIME }); }
    else if (p.attackT >= 0) {
      if (this.lastAttack !== p.attackId) { this.lastAttack = p.attackId; b.play('attack' + (p.combo + 1), { duration: p.attackSwingTime() }); }
    } else if (p.parryT >= 0) { if (b.state !== 'parry') b.play('parry', { duration: 0.35 }); }
    else if (!p.grounded) b.play('jump');
    else if (moving) b.play('run');
    else b.play('idle');
    b.update(dt, { speed: Math.hypot(p.vel.x, p.vel.z) });

    // Câmera
    const yaw = p.yaw, pitch = p.pitch;
    const look = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const target = new THREE.Vector3(p.pos.x, p.pos.y + 1.55, p.pos.z);
    const lim = room ? room.half - 0.35 : 1e9;
    let want = 4.2;
    const cand = new THREE.Vector3();
    for (; want > 0.8; want -= 0.2) {
      cand.copy(target).addScaledVector(right, this.shoulder).addScaledVector(look, -want);
      if (Math.abs(cand.x) > lim || Math.abs(cand.z) > lim || cand.y < 0.3) continue;
      if (room && room.pillars.some(q => Math.hypot(cand.x - q.x, cand.z - q.z) < q.r + 0.3 && cand.y < (q.h ?? 8))) continue;
      break;
    }
    // Aproxima rápido (colisão) e afasta devagar
    this.dist = want < this.dist ? want : this.dist + (want - this.dist) * Math.min(1, dt * 4);
    cam.position.copy(target).addScaledVector(right, this.shoulder).addScaledVector(look, -this.dist);
    cam.rotation.set(pitch, yaw, 0, 'YXZ');
    const fov = p.isDashing() ? 78 : 70;
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 10);
    cam.updateProjectionMatrix();
  }

  onHurt() { this.body.flinch(1); }
  dispose() { this.body.dispose(); }
}

// ---------------------------------------------------------------------------
// Jogador: movimento, ataque, aparo e esquiva são iguais para as duas classes.
// ---------------------------------------------------------------------------
export class Player {
  constructor(game, cls, stats) {
    this.game = game;
    this.camera = game.camera;
    this.hasClass = !!cls;
    this.cls = cls || CLASSES.mago;
    this.weapon = this.cls; // compatibilidade: atributos de ataque vêm da classe
    this.stats = stats;
    this.pos = new THREE.Vector3(0, 0, 10);
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.facing = 0;
    this.radius = 0.45;
    this.hp = stats.maxHp;
    this.dashCharges = this.maxDash();
    this.dashTimer = 0;
    this.dodgeT = -1;
    this.dodgeDir = new THREE.Vector3();
    this.iframes = 0;
    this.parryT = -1;
    this.parryCooldown = 0;
    this.attackT = -1;
    this.attackId = 0;
    this.attackDone = false;
    this.combo = 0;
    this.comboTimer = 0;
    this.queuedAttack = false;
    this.critNext = false;
    this.fury = 0;
    this.hurtCooldown = 0;
    this.grounded = true;
    this.parryFlash = 0;
    this.dead = false;
    this.locked = false; // sem controle (diálogos)
    this.res = 0;        // Ressonância (0-100) para o golpe supremo
    this.cdR = 0;        // recarga da habilidade [R]
    this.flurryT = 0;    // Cem Punhos ativo
    this.dragonT = 0;    // Investida do Dragão ativa
    this.stormT = 0;     // Tempestade de Ecos ativa
    this.counterT = 0;   // janela do Contragolpe
    this.thirdPerson = this.cls.view === 'third' && this.hasClass;
    this.view = this.thirdPerson
      ? new ThirdPersonView(this, this.camera, game.scene)
      : new FirstPersonView(this, this.camera, this.hasClass);
  }

  maxDash() { return this.stats.dashCharges + (this.cls.dashBonus || 0); }
  parryWindow() { return this.cls.parryWindow * this.stats.parryWindowMult; }
  isParrying() { return this.parryT >= 0 && this.parryT <= this.parryWindow(); }
  isInvulnerable() { return this.iframes > 0; }
  isDashing() { return this.dodgeT >= 0 && this.dodgeT < DODGE_TIME; }
  isPerfectDodge() { return this.dodgeT >= 0 && this.dodgeT <= PERFECT_DODGE_WINDOW; }
  eye() { return new THREE.Vector3(this.pos.x, this.pos.y + EYE, this.pos.z); }
  // Frente da câmera (movimento) e frente do corpo (golpes).
  forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  aimForward() { return new THREE.Vector3(-Math.sin(this.facing), 0, -Math.cos(this.facing)); }
  aimDir3() { return new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion); }
  heal(n) { this.hp = Math.min(this.stats.maxHp, this.hp + n); }
  attackSwingTime() { return this.cls.swingTime / this.stats.attackSpeed; }
  muzzle(combo) { return this.view.muzzle(combo); }

  // Em 3ª pessoa, vira o corpo para o inimigo mais próximo na direção da câmera.
  faceAim() {
    if (!this.thirdPerson) return;
    const camF = this.forward();
    let best = null, bd = 6.5;
    for (const e of this.game.enemies) {
      if (e.dead || e.baseY > 1.5 || e.friendly) continue;
      const to = new THREE.Vector3(e.pos.x - this.pos.x, 0, e.pos.z - this.pos.z);
      const d = to.length();
      if (d < bd && camF.dot(to.normalize()) > 0.45) { bd = d; best = e; }
    }
    const dir = best ? new THREE.Vector3(best.pos.x - this.pos.x, 0, best.pos.z - this.pos.z) : camF;
    this.facing = Math.atan2(-dir.x, -dir.z);
  }

  update(dt, input) {
    const game = this.game;
    const [mdx, mdy] = input.takeMouse();
    const s = 0.0022 * input.sensitivity;
    this.yaw -= mdx * s;
    const [pmin, pmax] = this.thirdPerson ? [-0.85, 0.75] : [-1.45, 1.45];
    this.pitch = Math.max(pmin, Math.min(pmax, this.pitch - mdy * s));

    const maxD = this.maxDash();
    if (this.dashCharges < maxD) {
      this.dashTimer += dt;
      if (this.dashTimer >= this.stats.dashRecharge) { this.dashTimer = 0; this.dashCharges++; }
    } else this.dashTimer = 0;

    const f = this.forward();
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const wish = new THREE.Vector3();
    if (!this.locked && !this.dead) {
      if (input.down('KeyW')) wish.add(f);
      if (input.down('KeyS')) wish.sub(f);
      if (input.down('KeyD')) wish.add(r);
      if (input.down('KeyA')) wish.sub(r);
    }
    if (wish.lengthSq() > 0) wish.normalize();
    const moving = wish.lengthSq() > 0;

    const attacking = this.attackT >= 0;
    const speed = 7.2 * this.stats.moveSpeed * (attacking ? 0.55 : 1) * (this.parryT >= 0 && this.parryT < 0.3 ? 0.6 : 1) * (this.flurryT > 0 ? 0.35 : 1);
    const canAct = !this.locked && !this.dead && this.flurryT <= 0;
    this.cdR = Math.max(0, this.cdR - dt);
    this.counterT = Math.max(0, this.counterT - dt);
    if (this.flurryT > 0) { this.flurryT -= dt; this.iframes = Math.max(this.iframes, 0.05); }
    if (this.dragonT > 0) this.dragonT -= dt;
    if (this.stormT > 0) this.stormT -= dt;

    if (canAct && (input.consume('ShiftLeft') || input.consume('ShiftRight') || input.consume('KeyQ'))) {
      this.tryDodge(moving ? wish : (this.thirdPerson ? this.aimForward().negate() : f.clone().negate()));
    }

    if (this.dodgeT >= 0) {
      this.dodgeT += dt;
      if (this.dodgeT < DODGE_TIME) {
        const k = 1 - this.dodgeT / DODGE_TIME;
        const sp = this.dragonT > 0 ? 32 : (this.cls.dodgeSpeed || 19) * this.stats.dodgeDistMult;
        this.pos.addScaledVector(this.dodgeDir, sp * (0.4 + k) * dt);
      }
      if (this.dodgeT > 0.5) this.dodgeT = -1;
    }
    if (!this.isDashing()) {
      const accel = this.grounded ? 14 : 4;
      this.vel.x += (wish.x * speed - this.vel.x) * Math.min(1, accel * dt);
      this.vel.z += (wish.z * speed - this.vel.z) * Math.min(1, accel * dt);
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
    }
    this.iframes = Math.max(0, this.iframes - dt);

    if (canAct && input.consume('Space') && this.grounded) { this.vy = 8.5; this.grounded = false; sfx.jump(); }
    this.vy -= GRAV * dt;
    this.pos.y += this.vy * dt;
    if (this.pos.y <= 0) { this.pos.y = 0; this.vy = 0; this.grounded = true; }

    // Aparo
    if (this.parryCooldown > 0) this.parryCooldown -= dt;
    if (canAct && (input.consume('Mouse2') || input.consume('KeyF')) && this.parryCooldown <= 0 && this.dodgeT < 0) {
      this.parryT = 0;
      this.parryCooldown = 0.42;
      this.attackT = -1;
      this.queuedAttack = false;
      this.faceAim();
      sfx.parryWhiff();
    }
    if (this.parryT >= 0) {
      this.parryT += dt;
      if (this.parryT > 0.35) this.parryT = -1;
    }

    // Ataque
    if (canAct && this.hasClass && input.consume('Mouse0')) {
      if (this.attackT < 0 && this.parryT < 0 && !this.isDashing()) this.startAttack();
      else this.queuedAttack = true;
    }
    if (this.attackT >= 0) {
      const st = this.attackSwingTime();
      this.attackT += dt;
      // Punhos avançam um passo no golpe
      if (this.thirdPerson && this.attackT < st * this.cls.activeAt) this.pos.addScaledVector(this.aimForward(), 3 * dt);
      if (!this.attackDone && this.attackT >= st * this.cls.activeAt) {
        this.attackDone = true;
        this.faceAim();
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

    // Direção do corpo
    if (!this.thirdPerson) this.facing = this.yaw;
    else if (moving && this.attackT < 0 && this.parryT < 0) {
      const want = this.isDashing() ? Math.atan2(-this.dodgeDir.x, -this.dodgeDir.z) : Math.atan2(-wish.x, -wish.z);
      let d = want - this.facing;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.facing += d * Math.min(1, dt * 14);
    }

    game.room.collide(this.pos, this.radius);
    if (this.hurtCooldown > 0) this.hurtCooldown -= dt;
    this.parryFlash = Math.max(0, this.parryFlash - dt * 4);
    this.view.update(dt, moving, game.room);
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
    if (this.cls.id === 'mago' && this.hasClass) this.game.fx.burst(this.pos.clone().setY(1.2), this.cls.color, 10, 3, 0.4);
    this.game.onPlayerDodge();
  }

  // Investida do Dragão: esquiva longa na direção do corpo, sem gastar carga.
  dragonDash() {
    this.faceAim();
    this.dodgeT = 0;
    this.dodgeId = (this.dodgeId || 0) + 1;
    this.iframes = 0.42;
    this.dragonT = 0.3;
    this.dodgeDir.copy(this.aimForward());
    this.attackT = -1; this.parryT = -1; this.queuedAttack = false;
  }

  startAttack() {
    this.attackT = 0;
    this.attackId++;
    this.attackDone = false;
    this.faceAim();
    sfx.swing();
  }

  onHurt() { this.view.onHurt(); }
  dispose() { this.view.dispose(); }
}

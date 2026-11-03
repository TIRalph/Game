import * as THREE from 'three';
import { sfx } from './audio.js';

const RED = new THREE.Color(0xff2a2a);
const ORANGE = new THREE.Color(0xff8a00);
const EYE_IDLE = new THREE.Color(0xffe0a0);

// Definição dos tipos de inimigo e seus ataques.
// kind: melee | lunge | shoot | fan | slam | summon
export const ENEMY_TYPES = {
  carcereiro: {
    name: 'Carcereiro', hp: 60, posture: 55, speed: 3.8, radius: 0.5, height: 1.9, color: 0x6a6480,
    weapon: 'blade', prefer: 2.0,
    attacks: [
      { kind: 'melee', windup: 0.7, reach: 2.4, arc: 0.9, damage: 12, recover: 0.7, weight: 3 },
      { kind: 'melee', windup: 0.6, reach: 2.4, arc: 0.9, damage: 10, recover: 0.15, weight: 2, chain: { kind: 'melee', windup: 0.38, reach: 2.5, arc: 0.9, damage: 10, recover: 0.8 } },
    ],
  },
  atirador: {
    name: 'Atirador', hp: 40, posture: 40, speed: 3.2, radius: 0.45, height: 1.8, color: 0x4a6a60,
    weapon: 'bow', prefer: 11, ranged: true,
    attacks: [
      { kind: 'shoot', windup: 0.9, damage: 10, speed: 17, recover: 1.0, weight: 4, range: 30 },
      { kind: 'shoot', windup: 1.2, damage: 18, speed: 13, recover: 1.2, weight: 1, range: 30, unparryable: true },
    ],
  },
  bruto: {
    name: 'Bruto', hp: 170, posture: 140, speed: 2.7, radius: 0.9, height: 2.7, color: 0x7a4a3a,
    weapon: 'club', prefer: 2.6, heavy: true,
    attacks: [
      { kind: 'melee', windup: 0.95, reach: 3.3, arc: 1.0, damage: 22, recover: 0.9, weight: 3, posture: 1.4 },
      { kind: 'slam', windup: 1.15, reach: 2.8, damage: 26, recover: 1.2, weight: 2, unparryable: true, wave: { speed: 9, maxR: 13, damage: 14 } },
    ],
  },
  duelista: {
    name: 'Duelista', hp: 75, posture: 70, speed: 5.2, radius: 0.45, height: 1.85, color: 0x5a3a6a,
    weapon: 'rapier', prefer: 2.2,
    attacks: [
      // Finta: o tempo de preparação varia a cada ataque
      { kind: 'melee', windup: [0.4, 1.15], reach: 2.6, arc: 0.7, damage: 13, recover: 0.6, weight: 3 },
      { kind: 'lunge', windup: 0.75, reach: 1.6, arc: 1.0, damage: 18, recover: 0.8, weight: 2, unparryable: true, dash: 15, dashTime: 0.32, minDist: 4 },
      { kind: 'melee', windup: 0.55, reach: 2.5, arc: 0.8, damage: 8, recover: 0.08, weight: 2,
        chain: { kind: 'melee', windup: 0.28, reach: 2.5, arc: 0.8, damage: 8, recover: 0.08,
          chain: { kind: 'melee', windup: 0.5, reach: 2.6, arc: 0.8, damage: 12, recover: 0.9 } } },
    ],
  },
  arauto: {
    name: 'O Arauto', hp: 900, posture: 260, speed: 3.4, radius: 1.2, height: 3.6, color: 0x2a2440,
    weapon: 'greatsword', prefer: 3.0, boss: true, heavy: true,
    attacks: [
      { kind: 'melee', windup: 0.8, reach: 3.8, arc: 1.1, damage: 16, recover: 0.12, weight: 3, posture: 0.8,
        chain: { kind: 'melee', windup: 0.42, reach: 3.8, arc: 1.1, damage: 16, recover: 0.12, posture: 0.8,
          chain: { kind: 'melee', windup: 0.95, reach: 4.0, arc: 1.2, damage: 24, recover: 1.0, posture: 1.2 } } },
      { kind: 'lunge', windup: 0.85, reach: 2.2, arc: 1.0, damage: 28, recover: 1.0, weight: 2, unparryable: true, dash: 20, dashTime: 0.4, minDist: 5 },
      { kind: 'slam', windup: 1.1, reach: 3.5, damage: 30, recover: 1.0, weight: 2, unparryable: true, wave: { speed: 10, maxR: 20, damage: 18 } },
      { kind: 'fan', windup: 0.9, damage: 14, speed: 15, count: 5, spread: 0.9, recover: 1.0, weight: 2, range: 40 },
    ],
    phase2: [
      { kind: 'slam', windup: 0.9, reach: 3.5, damage: 30, recover: 0.3, weight: 2, unparryable: true, wave: { speed: 11, maxR: 20, damage: 18 },
        chain: { kind: 'slam', windup: 0.6, reach: 3.5, damage: 30, recover: 1.0, unparryable: true, wave: { speed: 13, maxR: 20, damage: 18 } } },
      { kind: 'fan', windup: 0.7, damage: 14, speed: 17, count: 9, spread: 1.6, recover: 0.4, weight: 2, range: 40,
        chain: { kind: 'fan', windup: 0.45, damage: 14, speed: 17, count: 7, spread: 1.2, recover: 1.0, range: 40 } },
      { kind: 'summon', windup: 1.0, recover: 0.8, weight: 1, summon: ['carcereiro', 'atirador'] },
    ],
  },
};

function pickWeighted(list) {
  const total = list.reduce((a, b) => a + (b.weight || 1), 0);
  let r = Math.random() * total;
  for (const a of list) { r -= (a.weight || 1); if (r <= 0) return a; }
  return list[0];
}

function buildBody(def, elite) {
  const g = new THREE.Group();
  const h = def.height;
  const bodyMat = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.7, metalness: 0.2 });
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: EYE_IDLE.clone(), emissiveIntensity: 1.2 });
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x999aa8, metalness: 0.7, roughness: 0.3, emissive: new THREE.Color(0), emissiveIntensity: 0 });

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.15, h * 0.12, h * 0.42, 8), bodyMat);
  torso.position.y = h * 0.62; torso.castShadow = true; g.add(torso);
  const hips = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.12, h * 0.1, h * 0.12, 8), bodyMat);
  hips.position.y = h * 0.37; g.add(hips);
  const legGeo = new THREE.CylinderGeometry(h * 0.045, h * 0.04, h * 0.36, 6);
  const legL = new THREE.Mesh(legGeo, bodyMat); legL.position.set(-h * 0.06, h * 0.18, 0); g.add(legL);
  const legR = new THREE.Mesh(legGeo, bodyMat); legR.position.set(h * 0.06, h * 0.18, 0); g.add(legR);
  const head = new THREE.Mesh(new THREE.SphereGeometry(h * 0.1, 10, 8), bodyMat);
  head.position.y = h * 0.92; head.castShadow = true; g.add(head);
  const eyeGeo = new THREE.BoxGeometry(h * 0.04, h * 0.018, h * 0.02);
  const eyeL = new THREE.Mesh(eyeGeo, glowMat); eyeL.position.set(-h * 0.035, h * 0.93, -h * 0.09); g.add(eyeL);
  const eyeR = new THREE.Mesh(eyeGeo, glowMat); eyeR.position.set(h * 0.035, h * 0.93, -h * 0.09); g.add(eyeR);

  // Braço da arma (pivô no ombro)
  const arm = new THREE.Group();
  arm.position.set(h * 0.2, h * 0.78, 0);
  g.add(arm);
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.04, h * 0.035, h * 0.3, 6), bodyMat);
  upper.position.y = -h * 0.15; arm.add(upper);
  const weapon = new THREE.Group();
  weapon.position.y = -h * 0.3;
  arm.add(weapon);
  let len = h * 0.45;
  if (def.weapon === 'blade') {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, len, 0.03), bladeMat); b.position.y = -len / 2; weapon.add(b);
  } else if (def.weapon === 'rapier') {
    len = h * 0.55;
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, len, 0.03), bladeMat); b.position.y = -len / 2; weapon.add(b);
  } else if (def.weapon === 'club') {
    len = h * 0.45;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.08, len, 7), bladeMat); b.position.y = -len / 2; weapon.add(b);
  } else if (def.weapon === 'greatsword') {
    len = h * 0.6;
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, len, 0.05), bladeMat); b.position.y = -len / 2; weapon.add(b);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.1), glowMat); weapon.add(guard);
  } else if (def.weapon === 'bow') {
    const b = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.03, 4, 12, Math.PI), bladeMat);
    b.rotation.z = Math.PI / 2; b.position.y = -0.1; weapon.add(b);
  }
  weapon.rotation.x = -Math.PI / 2; // apontado para frente

  if (def.boss) {
    const crown = new THREE.Mesh(new THREE.TorusGeometry(h * 0.1, h * 0.015, 4, 8), glowMat);
    crown.rotation.x = Math.PI / 2; crown.position.y = h * 1.0; g.add(crown);
    const capeMat = new THREE.MeshStandardMaterial({ color: 0x400818, side: THREE.DoubleSide, roughness: 0.9 });
    const cape = new THREE.Mesh(new THREE.PlaneGeometry(h * 0.35, h * 0.6), capeMat);
    cape.position.set(0, h * 0.5, h * 0.14); g.add(cape);
  }
  if (elite) {
    const aura = new THREE.Mesh(new THREE.TorusGeometry(def.radius * 1.3, 0.05, 6, 24), new THREE.MeshBasicMaterial({ color: 0xff7af5 }));
    aura.rotation.x = Math.PI / 2; aura.position.y = 0.1; g.add(aura);
    g.userData.aura = aura;
  }
  g.userData = { ...g.userData, bodyMat, glowMat, bladeMat, arm, weapon, legL, legR };
  return g;
}

function makeBars(width) {
  const g = new THREE.Group();
  const mk = (color, h, y, w = width) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true }));
    m.position.y = y; m.renderOrder = 999; g.add(m); return m;
  };
  mk(0x000000, 0.16, 0, width + 0.06).material.opacity = 0.6;
  const hp = mk(0xff3a4a, 0.1, 0.02);
  const post = mk(0xffd34a, 0.04, -0.06);
  g.userData = { hp, post, width };
  return g;
}

export class Enemy {
  constructor(game, type, pos, opts = {}) {
    const def = ENEMY_TYPES[type];
    this.game = game;
    this.type = type;
    this.def = def;
    this.elite = !!opts.elite;
    const scale = opts.scale || 1;
    this.hpMax = def.hp * scale * (this.elite ? 1.8 : 1);
    this.hp = this.hpMax;
    this.postureMax = def.posture * (this.elite ? 1.4 : 1) * (opts.postureScale || 1);
    this.posture = 0;
    this.postureIdle = 0;
    this.dmgMult = (opts.dmgScale || 1) * (this.elite ? 1.3 : 1);
    this.speed = def.speed * (this.elite ? 1.1 : 1);
    this.radius = def.radius * (this.elite ? 1.15 : 1);
    this.pos = pos.clone();
    this.baseY = pos.y;
    this.facing = 0;
    this.state = 'move';
    this.t = 0;
    this.cooldown = 0.8 + Math.random() * 1.2;
    this.atk = null;
    this.stunT = 0;
    this.broken = false;
    this.flinch = 0;
    this.knock = new THREE.Vector3();
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.strafeTimer = 0;
    this.dead = false;
    this.deathT = 0;
    this.phase = 1;
    this.stationary = !!opts.stationary;
    this.hitThisLunge = false;
    this.walk = Math.random() * 10;

    this.mesh = buildBody(def, this.elite);
    if (this.elite) this.mesh.scale.setScalar(1.15);
    this.mesh.position.copy(this.pos);
    game.scene.add(this.mesh);
    this.bars = def.boss ? null : makeBars(Math.max(0.9, this.radius * 2));
    if (this.bars) game.scene.add(this.bars);

    // Indicador de área (slam)
    this.areaMesh = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: ORANGE, transparent: true, opacity: 0, depthWrite: false }));
    this.areaMesh.rotation.x = -Math.PI / 2;
    this.areaMesh.position.y = 0.03;
    game.scene.add(this.areaMesh);
  }

  get unparryable() { return this.atk && this.atk.unparryable; }

  startAttack(atk) {
    this.atk = { ...atk };
    const w = atk.windup;
    this.atk.windupTime = Array.isArray(w) ? w[0] + Math.random() * (w[1] - w[0]) : w;
    if (this.phase === 2) this.atk.windupTime *= 0.85;
    this.state = 'windup';
    this.t = 0;
    this.hitThisLunge = false;
    sfx.windup(!!atk.unparryable);
  }

  update(dt) {
    const game = this.game;
    const player = game.player;
    if (this.dead) {
      this.deathT += dt;
      this.mesh.rotation.x = Math.min(Math.PI / 2, this.deathT * 4) * -1;
      this.mesh.position.y = this.baseY - this.deathT * 0.8;
      if (this.deathT > 1.2) this.remove();
      return;
    }

    const ud = this.mesh.userData;
    const toP = new THREE.Vector3(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z);
    const dist = toP.length();
    const desiredFacing = Math.atan2(-toP.x, -toP.z);

    // Recuperação de postura
    this.postureIdle += dt;
    if (this.postureIdle > 2 && !this.broken) this.posture = Math.max(0, this.posture - this.postureMax * 0.12 * dt);

    // Empurrão
    if (this.knock.lengthSq() > 0.001) {
      this.pos.addScaledVector(this.knock, dt);
      this.knock.multiplyScalar(Math.max(0, 1 - dt * 8));
    }
    this.flinch = Math.max(0, this.flinch - dt * 5);

    let glowK = 0;
    let glowColor = RED;
    let armRot = 0;

    if (this.state === 'stagger') {
      this.stunT -= dt;
      this.mesh.rotation.z = Math.sin(this.stunT * 20) * 0.08;
      armRot = 0.6;
      if (this.stunT <= 0) {
        this.state = 'move';
        this.broken = false;
        this.mesh.rotation.z = 0;
        if (this.posture >= this.postureMax) this.posture = 0;
        this.cooldown = 0.3 + Math.random() * 0.5;
      }
    } else if (this.state === 'move') {
      this.turnTo(desiredFacing, dt, 6);
      this.cooldown -= dt;
      const pool = (this.phase === 2 && this.def.phase2) ? this.def.attacks.concat(this.def.phase2) : this.def.attacks;
      if (!this.stationary) {
        const move = new THREE.Vector3();
        const dir = toP.clone().normalize();
        const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(this.strafeDir);
        this.strafeTimer -= dt;
        if (this.strafeTimer <= 0) { this.strafeTimer = 1 + Math.random() * 2; if (Math.random() < 0.4) this.strafeDir *= -1; }
        if (this.def.ranged) {
          if (dist < this.def.prefer - 2) move.addScaledVector(dir, -1);
          else if (dist > this.def.prefer + 3) move.add(dir);
          move.addScaledVector(side, 0.7);
        } else {
          if (dist > this.def.prefer) move.add(dir);
          else if (dist < this.def.prefer * 0.6) move.addScaledVector(dir, -0.6);
          if (dist < 6) move.addScaledVector(side, 0.45);
        }
        // Separação dos outros inimigos
        for (const o of game.enemies) {
          if (o === this || o.dead) continue;
          const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z;
          const d = Math.hypot(dx, dz);
          const min = this.radius + o.radius + 0.5;
          if (d < min && d > 0.001) move.add(new THREE.Vector3(dx / d, 0, dz / d).multiplyScalar((min - d) * 1.5));
        }
        if (move.lengthSq() > 1) move.normalize();
        this.pos.addScaledVector(move, this.speed * dt);
        if (move.lengthSq() > 0.01) this.walk += dt * this.speed * 2.5;
      }
      if (this.cooldown <= 0) {
        const usable = pool.filter(a => {
          if (a.kind === 'melee' || a.kind === 'slam') return dist < (a.reach + 1.5);
          if (a.kind === 'lunge') return dist > (a.minDist || 0) && dist < 12;
          if (a.kind === 'shoot' || a.kind === 'fan') return dist < (a.range || 30) && (this.stationary || !game.room.blocked(this.pos, player.pos));
          if (a.kind === 'summon') return game.enemies.filter(e => !e.dead).length < 4;
          return true;
        });
        if (usable.length) this.startAttack(pickWeighted(usable));
      }
    } else if (this.state === 'windup') {
      this.t += dt;
      const remain = this.atk.windupTime - this.t;
      // Gira rápido no começo, devagar no fim: dá para sair pelo lado
      this.turnTo(desiredFacing, dt, remain > 0.25 ? 7 : 1.5);
      const k = Math.min(1, this.t / this.atk.windupTime);
      glowK = 0.3 + k * 2.5 + (remain < 0.14 ? 5 : 0);
      glowColor = this.atk.unparryable ? ORANGE : RED;
      armRot = -k * 1.6;
      if (this.atk.kind === 'slam') {
        this.areaMesh.position.set(this.pos.x, 0.03, this.pos.z);
        this.areaMesh.scale.setScalar(this.atk.reach);
        this.areaMesh.material.opacity = 0.15 + k * 0.3;
      }
      if (this.t >= this.atk.windupTime) this.execute();
    } else if (this.state === 'active') {
      // Investida
      this.t += dt;
      const fwd = new THREE.Vector3(-Math.sin(this.facing), 0, -Math.cos(this.facing));
      this.pos.addScaledVector(fwd, this.atk.dash * dt);
      glowK = 4; glowColor = ORANGE; armRot = 0.4;
      if (!this.hitThisLunge) {
        const r = game.enemyStrike(this, this.atk);
        if (r !== 'miss') this.hitThisLunge = true;
      }
      if (this.t >= this.atk.dashTime) { this.state = 'recover'; this.t = 0; }
    } else if (this.state === 'recover') {
      this.t += dt;
      armRot = 0.9 * Math.max(0, 1 - this.t / 0.3);
      if (this.t >= this.atk.recover) {
        if (this.atk.chain) this.startAttack(this.atk.chain);
        else {
          this.state = 'move';
          this.cooldown = (this.def.boss ? 0.5 : 0.9) + Math.random() * (this.def.ranged ? 1.5 : 1.0);
          if (this.phase === 2) this.cooldown *= 0.6;
        }
      }
    }

    if (this.state !== 'windup') this.areaMesh.material.opacity = Math.max(0, this.areaMesh.material.opacity - dt * 3);

    if (!this.stationary) game.room.collide(this.pos, this.radius);
    this.mesh.position.set(this.pos.x, this.baseY, this.pos.z);
    this.mesh.rotation.y = this.facing;
    if (this.flinch > 0) this.mesh.rotation.x = -this.flinch * 0.25;
    else if (this.state !== 'stagger') this.mesh.rotation.x = 0;
    ud.arm.rotation.x = armRot;
    ud.legL.rotation.x = Math.sin(this.walk) * 0.5;
    ud.legR.rotation.x = -Math.sin(this.walk) * 0.5;
    if (ud.aura) ud.aura.rotation.z += dt * 2;

    // Brilho de aviso
    if (glowK > 0) {
      ud.glowMat.emissive.copy(glowColor);
      ud.glowMat.emissiveIntensity = glowK;
      ud.bladeMat.emissive.copy(glowColor);
      ud.bladeMat.emissiveIntensity = glowK * 0.6;
    } else if (this.state === 'stagger') {
      ud.glowMat.emissive.setRGB(1, 0.85, 0.2);
      ud.glowMat.emissiveIntensity = 2 + Math.sin(this.stunT * 30);
      ud.bladeMat.emissiveIntensity = 0;
    } else {
      ud.glowMat.emissive.copy(EYE_IDLE);
      ud.glowMat.emissiveIntensity = 1.2;
      ud.bladeMat.emissiveIntensity = 0;
    }

    if (this.bars) {
      const b = this.bars;
      b.position.set(this.pos.x, this.baseY + this.def.height * (this.elite ? 1.15 : 1) + 0.4, this.pos.z);
      b.quaternion.copy(game.camera.quaternion);
      const w = b.userData.width;
      const hk = Math.max(0, this.hp / this.hpMax);
      b.userData.hp.scale.x = Math.max(0.001, hk);
      b.userData.hp.position.x = -(1 - hk) * w / 2;
      const pk = Math.min(1, this.posture / this.postureMax);
      b.userData.post.scale.x = Math.max(0.001, pk);
      b.userData.post.position.x = -(1 - pk) * w / 2;
      b.visible = hk < 1 || pk > 0.01;
    }

    if (this.def.boss && this.phase === 1 && this.hp < this.hpMax * 0.5) {
      this.phase = 2;
      game.fx.callout('O ARAUTO ENFURECE', '#ff3030', 1.4);
      game.fx.addShake(0.6);
      this.speed *= 1.25;
    }
  }

  turnTo(target, dt, rate) {
    let d = target - this.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.facing += Math.max(-rate * dt, Math.min(rate * dt, d));
  }

  forward() { return new THREE.Vector3(-Math.sin(this.facing), 0, -Math.cos(this.facing)); }

  execute() {
    const game = this.game;
    const a = this.atk;
    this.t = 0;
    switch (a.kind) {
      case 'melee':
        game.enemyStrike(this, a);
        if (this.state === 'windup') this.state = 'recover';
        break;
      case 'lunge':
        this.state = 'active';
        break;
      case 'slam':
        game.enemyStrike(this, a);
        game.spawnShockwave(this.pos.clone(), a.wave, this);
        sfx.slam();
        game.fx.addShake(0.4);
        game.fx.burst(this.pos.clone().setY(0.2), 0xff8a00, 20, 8, 0.6);
        if (this.state === 'windup') this.state = 'recover';
        break;
      case 'shoot':
      case 'fan': {
        const origin = this.pos.clone(); origin.y = this.baseY + this.def.height * 0.75;
        const target = game.player.eye(); target.y -= 0.4;
        // Leve previsão de movimento
        target.addScaledVector(game.player.vel, 0.25);
        const dir = target.sub(origin).normalize();
        const n = a.kind === 'fan' ? a.count : 1;
        for (let i = 0; i < n; i++) {
          const ang = n > 1 ? (i / (n - 1) - 0.5) * a.spread : 0;
          const d = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), ang);
          game.spawnProjectile(origin.clone().addScaledVector(d, this.radius + 0.3), d.multiplyScalar(a.speed), a.damage * this.dmgMult, !!a.unparryable, this);
        }
        sfx.shoot();
        this.state = 'recover';
        break;
      }
      case 'summon':
        for (const t of a.summon) game.summonNear(t, this.pos);
        game.fx.ring(this.pos.clone(), 0xff3030, 6, 0.5);
        this.state = 'recover';
        break;
    }
  }

  // Aparado pelo jogador
  onParried(postureDmg) {
    this.addPosture(postureDmg);
    if (this.state === 'stagger') return;
    const heavy = this.def.heavy;
    if (!heavy || this.broken) {
      this.state = 'stagger';
      this.stunT = this.broken ? 2.2 : 0.9;
    } else {
      // Interrompe só o golpe atual, mas mantém a corrente (chefe/bruto)
      this.flinch = 1;
      this.state = 'recover';
      this.t = 0;
      if (this.atk) this.atk.recover = Math.max(this.atk.recover, 0.5);
    }
  }

  addPosture(v) {
    this.posture += v;
    this.postureIdle = 0;
    if (this.posture >= this.postureMax && !this.broken) {
      this.posture = this.postureMax;
      this.broken = true;
      this.state = 'stagger';
      this.stunT = 2.2;
      this.atk = null;
      sfx.stagger();
      this.game.fx.callout('POSTURA QUEBRADA', '#ffd34a', 0.8);
    }
  }

  isStunned() { return this.state === 'stagger'; }

  takeDamage(d, knockDir = null, knockPower = 0) {
    this.hp -= d;
    this.flinch = 1;
    if (knockDir && !this.def.heavy && !this.stationary) this.knock.addScaledVector(knockDir, knockPower);
    if (this.hp <= 0) this.die();
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.hp = 0;
    sfx.death();
    if (this.bars) this.bars.visible = false;
    this.areaMesh.visible = false;
    this.game.onEnemyKilled(this);
  }

  remove() {
    if (this.removed) return;
    this.removed = true;
    const s = this.game.scene;
    s.remove(this.mesh);
    if (this.bars) s.remove(this.bars);
    s.remove(this.areaMesh);
    this.mesh.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
}

// Projéteis (flechas / orbes). Podem ser refletidos com aparo.
export class Projectile {
  constructor(game, pos, vel, damage, unparryable, owner) {
    this.game = game;
    this.pos = pos;
    this.vel = vel;
    this.damage = damage;
    this.unparryable = unparryable;
    this.owner = owner;
    this.reflected = false;
    this.life = 4;
    this.dead = false;
    this.homing = false;
    const color = unparryable ? 0xff8a00 : 0xff2a3a;
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color }));
    this.mesh.scale.z = 3.2;
    this.trail = new THREE.PointLight(color, 6, 4, 2);
    this.mesh.add(this.trail);
    this.mesh.position.copy(pos);
    game.scene.add(this.mesh);
  }

  reflect(dir, mult, homing) {
    this.reflected = true;
    this.homing = homing;
    this.damage *= mult;
    this.vel.copy(dir).multiplyScalar(Math.max(24, this.vel.length() * 1.6));
    this.life = 3;
    this.mesh.material.color.set(0x5ce1ff);
    this.trail.color.set(0x5ce1ff);
  }

  update(dt) {
    const game = this.game;
    this.life -= dt;
    if (this.homing) {
      let best = null, bd = 1e9;
      for (const e of game.enemies) {
        if (e.dead) continue;
        const d = e.pos.distanceTo(this.pos);
        if (d < bd) { bd = d; best = e; }
      }
      if (best) {
        const want = best.pos.clone(); want.y = best.baseY + best.def.height * 0.6;
        want.sub(this.pos).normalize().multiplyScalar(this.vel.length());
        this.vel.lerp(want, Math.min(1, dt * 6));
      }
    }
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    this.mesh.lookAt(this.pos.clone().add(this.vel));

    // Colisões
    const room = game.room;
    if (Math.abs(this.pos.x) > room.half || Math.abs(this.pos.z) > room.half || this.pos.y < 0 || this.life <= 0) return this.kill();
    for (const p of room.pillars) {
      if (Math.hypot(this.pos.x - p.x, this.pos.z - p.z) < p.r && this.pos.y < 8) {
        // Torres só bloqueiam até a altura delas
        if (room.towers.length && this.pos.y > 3) continue;
        return this.kill();
      }
    }
    if (this.reflected) {
      for (const e of game.enemies) {
        if (e.dead) continue;
        const c = e.pos.clone(); c.y = e.baseY + e.def.height * 0.55;
        if (c.distanceTo(this.pos) < e.radius + 0.6 + e.def.height * 0.15) {
          game.projectileHitEnemy(this, e);
          return this.kill();
        }
      }
    } else {
      game.projectileVsPlayer(this);
    }
  }

  kill() {
    if (this.dead) return;
    this.dead = true;
    this.game.fx.burst(this.pos.clone(), this.reflected ? 0x5ce1ff : 0xff5a3a, 6, 3, 0.3);
    this.game.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

// Onda de choque no chão: pule ou esquive.
export class Shockwave {
  constructor(game, pos, cfg, owner) {
    this.game = game;
    this.pos = pos; this.pos.y = 0;
    this.r = 0.5;
    this.speed = cfg.speed;
    this.maxR = cfg.maxR;
    this.damage = cfg.damage * (owner ? owner.dmgMult : 1);
    this.hit = false;
    this.dead = false;
    const geo = new THREE.TorusGeometry(1, 0.08, 6, 64);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x5ce1ff, transparent: true }));
    this.mesh.rotation.x = Math.PI / 2;
    this.mesh.position.set(pos.x, 0.15, pos.z);
    game.scene.add(this.mesh);
  }
  update(dt) {
    const prev = this.r;
    this.r += this.speed * dt;
    this.mesh.scale.set(this.r, this.r, 1 + this.r * 0.08);
    this.mesh.material.opacity = 1 - this.r / this.maxR;
    if (!this.hit) {
      const p = this.game.player;
      const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
      if (d >= prev - p.radius && d <= this.r + p.radius && p.pos.y < 0.6) {
        if (this.game.waveVsPlayer(this)) this.hit = true;
      }
    }
    if (this.r >= this.maxR) this.kill();
  }
  kill() {
    if (this.dead) return;
    this.dead = true;
    this.game.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

import * as THREE from 'three';
import { sfx } from './audio.js';
import { createCharacter } from './models.js';

const RED = new THREE.Color(0xff2a2a);
const ORANGE = new THREE.Color(0xff8a00);
const YELLOW = new THREE.Color(0xffd34a);

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
  // Boneco de treino do mosteiro: ataques lentos e sem dano, nunca morre.
  boneco: {
    name: 'Boneco de Treino', hp: 400, posture: 90, speed: 0, radius: 0.5, height: 1.8, color: 0x8a6a40, hood: 0x5a4020,
    weapon: 'blade', prefer: 2, training: true,
    attacks: [
      { kind: 'melee', windup: 1.1, reach: 2.6, arc: 1.2, damage: 0, recover: 1.0, weight: 3 },
      { kind: 'melee', windup: 1.3, reach: 2.6, arc: 1.2, damage: 0, recover: 1.0, weight: 1, unparryable: true },
      { kind: 'slam', windup: 1.4, reach: 2.4, damage: 0, recover: 1.2, weight: 1, unparryable: true, wave: { speed: 7, maxR: 9, damage: 0 } },
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

// Opções do boneco procedural para cada tipo (usadas só quando não há .glb no manifesto).
function proceduralOpts(def) {
  return {
    height: def.height, color: def.color, weapon: def.weapon,
    weaponHand: def.weapon === 'bow' ? 'L' : 'R',
    crown: !!def.boss, cape: def.boss ? 0x400818 : null,
    hood: def.hood ?? null,
  };
}

function windupAnim(atk) {
  if (atk.kind === 'slam' || atk.kind === 'summon') return 'windup_heavy';
  if (atk.kind === 'shoot') return 'aim';
  return 'windup';
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
    this.lastPos = this.pos.clone();

    // Visual: placeholder procedural ou .glb do manifesto (ver models.js)
    this.model = createCharacter(type, proceduralOpts(def));
    this.mesh = this.model.root;
    if (this.elite) {
      this.mesh.scale.setScalar(1.15);
      const aura = new THREE.Mesh(new THREE.TorusGeometry(def.radius * 1.3, 0.05, 6, 24), new THREE.MeshBasicMaterial({ color: 0xff7af5 }));
      aura.rotation.x = Math.PI / 2; aura.position.y = 0.1;
      this.mesh.add(aura);
      this.aura = aura;
    }
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
    this.model.play(windupAnim(atk), { duration: this.atk.windupTime });
    sfx.windup(!!atk.unparryable);
  }

  update(dt) {
    const game = this.game;
    const player = game.player;
    if (this.dead) {
      this.deathT += dt;
      this.model.update(dt);
      this.mesh.position.y = this.baseY - Math.max(0, this.deathT - 0.6) * 1.2;
      if (this.deathT > 1.2) this.remove();
      return;
    }

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

    if (this.state === 'stagger') {
      this.stunT -= dt;
      this.mesh.rotation.z = Math.sin(this.stunT * 20) * 0.08;
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
      glowK = 4; glowColor = ORANGE;
      if (!this.hitThisLunge) {
        const r = game.enemyStrike(this, this.atk);
        if (r !== 'miss') this.hitThisLunge = true;
      }
      if (this.t >= this.atk.dashTime) { this.state = 'recover'; this.t = 0; }
    } else if (this.state === 'recover') {
      this.t += dt;
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
    if (this.aura) this.aura.rotation.z += dt * 2;

    // Animação
    const moved = Math.hypot(this.pos.x - this.lastPos.x, this.pos.z - this.lastPos.z) / Math.max(dt, 1e-4);
    this.lastPos.copy(this.pos);
    const m = this.model;
    if (this.state === 'stagger') m.play('stagger');
    else if (this.state === 'move') m.play(moved > 0.6 ? 'run' : 'idle');
    m.update(dt, { speed: moved });

    // Brilho de aviso
    if (glowK > 0) m.setGlow(glowColor, glowK);
    else if (this.state === 'stagger') m.setGlow(YELLOW, 2 + Math.sin(this.stunT * 30));
    else m.setGlow(null);

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
        this.model.play('strike', { duration: 0.2 });
        game.enemyStrike(this, a);
        if (this.state === 'windup') this.state = 'recover';
        break;
      case 'lunge':
        this.model.play('lunge', { duration: a.dashTime });
        this.state = 'active';
        break;
      case 'slam':
        this.model.play('strike_heavy', { duration: 0.25 });
        game.enemyStrike(this, a);
        game.spawnShockwave(this.pos.clone(), a.wave, this);
        sfx.slam();
        game.fx.addShake(0.4);
        game.fx.burst(this.pos.clone().setY(0.2), 0xff8a00, 20, 8, 0.6);
        if (this.state === 'windup') this.state = 'recover';
        break;
      case 'shoot':
      case 'fan': {
        this.model.play('strike', { duration: 0.2 });
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
      this.model.flinch(1);
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
    this.model.flinch(1);
    if (knockDir && !this.def.heavy && !this.stationary) this.knock.addScaledVector(knockDir, knockPower);
    if (this.hp <= 0 && this.def.training) { this.hp = this.hpMax; this.game.fx.callout('BONECO RESTAURADO', '#e8c27a', 0.6); return; }
    if (this.hp <= 0) this.die();
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.hp = 0;
    sfx.death();
    if (this.bars) this.bars.visible = false;
    this.areaMesh.visible = false;
    this.model.setGlow(null);
    this.model.play('death', { duration: 0.6 });
    this.game.onEnemyKilled(this);
  }

  remove() {
    if (this.removed) return;
    this.removed = true;
    const s = this.game.scene;
    s.remove(this.mesh);
    if (this.bars) s.remove(this.bars);
    s.remove(this.areaMesh);
    this.model.dispose();
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
    this.playerShot = false; // disparo do jogador (mago)
    this.posture = 25;
    this.aoe = 0;
    this.pierce = 0;
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
        if (room.towers.length && this.pos.y > 2.6) continue;
        return this.kill();
      }
    }
    if (this.reflected) {
      for (const e of game.enemies) {
        if (e.dead) continue;
        const c = e.pos.clone(); c.y = e.baseY + e.def.height * 0.55;
        if (this.hitSet && this.hitSet.has(e)) continue;
        if (c.distanceTo(this.pos) < e.radius + 0.6 + e.def.height * 0.15) {
          game.projectileHitEnemy(this, e);
          if (this.pierce > 0) { this.pierce--; (this.hitSet = this.hitSet || new Set()).add(e); continue; }
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

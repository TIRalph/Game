import * as THREE from 'three';
import { Input } from './input.js';
import { FX } from './fx.js';
import { Room } from './world.js';
import { Player } from './player.js';
import { Enemy, Projectile, Shockwave } from './enemies.js';
import { sfx } from './audio.js';
import { WEAPONS, BOONS, baseStats, ROOM_TYPES, FLOORS, loadSave, writeSave } from './data.js';

const ROOMS_PER_FLOOR = 5; // + 1 sala de chefe
const SLOWMO_SCALE = 0.25;

export class Game {
  constructor(container, ui) {
    this.ui = ui;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 200);
    this.scene.add(this.camera);
    this.hemi = new THREE.HemisphereLight(0xb0a8ff, 0x302838, 2.2);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.4);
    this.sun.position.set(5, 12, 4);
    this.scene.add(this.sun);

    this.input = new Input(this.canvas);
    this.fx = new FX(this.scene, this.camera);
    this.save = loadSave();

    this.state = 'menu';
    this.enemies = [];
    this.projectiles = [];
    this.waves = [];
    this.room = null;
    this.player = null;
    this.hitstop = 0;
    this.slowmo = 0;
    this.timeScale = 1;
    this.elapsed = 0;

    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });

    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'playing') this.pause();
    };

    // Cena de fundo do menu
    this.buildRoom('open', FLOORS[0]);
    this.camera.position.set(0, 3, 12);

    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------- Run ----------
  startRun(weaponId) {
    const weapon = WEAPONS[weaponId];
    this.run = {
      weapon, floor: 0, roomIndex: 0, type: 'combate',
      stats: baseStats(this.save.meta), boons: [], ecos: 0,
      kills: 0, parries: 0, perfectDodges: 0, rooms: 0, startTime: performance.now(),
    };
    if (this.player) this.player.dispose();
    this.player = new Player(this.camera, weapon, this.run.stats);
    this.save.runs++;
    writeSave(this.save);
    this.ui.showHUD(true);
    this.ui.weapon(weapon.name);
    this.ui.boons([]);
    this.enterRoom('combate');
    this.state = 'playing';
    this.input.lock();
  }

  buildRoom(layout, theme) {
    this.clearEntities();
    if (this.room) this.room.dispose();
    const size = layout === 'boss' ? 40 : layout === 'towers' ? 36 : 34;
    this.room = new Room(this.scene, theme, layout, size);
    this.scene.fog = new THREE.Fog(theme.fog, 18, 75);
    this.scene.background = new THREE.Color(theme.fog);
    this.hemi.color.set(theme.light);
  }

  clearEntities() {
    for (const e of this.enemies) e.remove();
    for (const p of this.projectiles) p.kill();
    for (const w of this.waves) w.kill();
    this.enemies = []; this.projectiles = []; this.waves = [];
    this.fx.clear();
  }

  enterRoom(type) {
    const run = this.run;
    run.type = type;
    this.boss = null;
    this.ui.boss(false);
    const theme = FLOORS[run.floor];
    const layouts = { combate: ['arena', 'ring', 'open'], elite: ['ring', 'arena'], sobrevivencia: ['open', 'ring'], duelo: ['open'], flechas: ['towers'], santuario: ['open'], chefe: ['boss'] };
    const opts = layouts[type];
    this.buildRoom(opts[Math.floor(Math.random() * opts.length)], theme);
    const p = this.player;
    p.pos.set(0, 0, this.room.half - 3);
    p.vel.set(0, 0, 0);
    p.yaw = 0; p.pitch = 0;
    p.dashCharges = p.maxDash();

    this.roomState = { cleared: false, waves: [], waveIdx: 0, timer: 0, spawnTimer: 0, rewardGiven: false, doorsOpen: false, duel: type === 'duelo', started: 0.8 };
    const f = run.floor, i = run.roomIndex;
    const rs = this.roomState;
    if (type === 'combate') {
      rs.waves = [this.composeWave(3 + f * 2 + Math.floor(i / 2)), this.composeWave(4 + f * 2 + Math.floor(i / 2))];
    } else if (type === 'elite') {
      const e = ['bruto', 'duelista', 'carcereiro'];
      rs.waves = [[{ t: e[Math.floor(Math.random() * 3)], elite: true }, { t: f > 0 ? 'duelista' : 'carcereiro', elite: true }, { t: 'atirador' }]];
      if (f >= 1) rs.waves.push([{ t: 'bruto', elite: true }, { t: 'atirador' }, { t: 'atirador' }]);
    } else if (type === 'sobrevivencia') {
      rs.timer = 30 + f * 5;
    } else if (type === 'duelo') {
      rs.waves = [[{ t: 'duelista' }, { t: 'duelista' }]];
      if (f >= 1) rs.waves[0].push({ t: 'carcereiro' });
      if (f >= 2) rs.waves.push([{ t: 'duelista', elite: true }, { t: 'bruto' }]);
    } else if (type === 'flechas') {
      rs.waves = [[{ t: 'carcereiro' }, { t: 'carcereiro' }]];
      if (f >= 1) rs.waves[0].push({ t: 'duelista' });
      // Arqueiros nas torres
      const towers = this.room.towers.slice().sort(() => Math.random() - 0.5).slice(0, 4 + f);
      for (const tpos of towers) {
        const e = this.spawnEnemy('atirador', tpos.clone(), { stationary: true });
        e.cooldown = 1.5 + Math.random() * 2;
      }
    } else if (type === 'chefe') {
      rs.waves = [[{ t: 'arauto', boss: true }]];
    }
    if (type === 'santuario') {
      rs.cleared = true;
      this.ui.objective('Santuário · descanse');
    }
    const label = ROOM_TYPES[type].name;
    this.ui.roomName(`${FLOORS[run.floor].name} · ${type === 'chefe' ? 'Chefe' : 'Sala ' + (run.roomIndex + 1)} · ${label}`);
    this.fx.callout(label.toUpperCase(), '#' + ROOM_TYPES[type].color.toString(16).padStart(6, '0'), 1.2);
  }

  composeWave(budget) {
    const f = this.run.floor, i = this.run.roomIndex;
    const pool = [{ t: 'carcereiro', c: 1, w: 4 }, { t: 'atirador', c: 1.2, w: 2 }];
    if (f > 0 || i >= 1) pool.push({ t: 'duelista', c: 1.6, w: 2 });
    if (f > 0 || i >= 2) pool.push({ t: 'bruto', c: 2.5, w: 1 + f });
    const out = [];
    let b = budget;
    while (b > 0.9 && out.length < 7) {
      const opts = pool.filter(p => p.c <= b + 0.3);
      if (!opts.length) break;
      const tot = opts.reduce((a, o) => a + o.w, 0);
      let r = Math.random() * tot;
      let pick = opts[0];
      for (const o of opts) { r -= o.w; if (r <= 0) { pick = o; break; } }
      out.push({ t: pick.t });
      b -= pick.c;
    }
    return out;
  }

  scaleOpts() {
    const f = this.run.floor, i = this.run.roomIndex;
    return { scale: 1 + f * 0.5 + i * 0.06, dmgScale: 1 + f * 0.25 + i * 0.03 };
  }

  spawnEnemy(type, pos, extra = {}) {
    const e = new Enemy(this, type, pos, { ...this.scaleOpts(), ...extra });
    this.enemies.push(e);
    this.fx.ring(pos.clone(), 0xff3050, 2.5, 0.5);
    this.fx.burst(pos.clone().setY(1), 0xff3050, 10, 4, 0.5);
    return e;
  }

  randomSpawnPos(minDist = 9) {
    const h = this.room.half - 2;
    for (let k = 0; k < 40; k++) {
      const p = new THREE.Vector3((Math.random() * 2 - 1) * h, 0, (Math.random() * 2 - 1) * h);
      if (p.distanceTo(this.player.pos) < minDist) continue;
      if (this.room.pillars.some(q => Math.hypot(p.x - q.x, p.z - q.z) < q.r + 1.5)) continue;
      return p;
    }
    return new THREE.Vector3(0, 0, -this.room.half + 4);
  }

  spawnWave(list) {
    for (const s of list) {
      const pos = this.randomSpawnPos(s.boss ? 0 : 9);
      if (s.boss) pos.set(0, 0, -this.room.half * 0.4);
      const e = this.spawnEnemy(s.t, pos, { elite: s.elite });
      e.cooldown = 1.2 + Math.random();
      if (s.boss) {
        e.hpMax *= 1 + this.run.floor * 0.35; e.hp = e.hpMax;
        this.boss = e;
        this.ui.boss(true, FLOORS[this.run.floor].name === 'Cripta Esquecida' ? 'O Arauto' : this.run.floor === 1 ? 'O Arauto da Forja' : 'O Arauto do Abismo');
      }
    }
  }

  summonNear(type, pos) {
    const p = pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6));
    this.room.collide(p, 0.6);
    const e = this.spawnEnemy(type, p);
    e.cooldown = 1.5;
  }

  updateRoom(dt) {
    const rs = this.roomState;
    const run = this.run;
    if (rs.started > 0) { rs.started -= dt; if (rs.started <= 0 && rs.waves.length) this.spawnWave(rs.waves[rs.waveIdx]); return; }
    const alive = this.enemies.filter(e => !e.dead && !e.stationary).length;
    const towerAlive = this.enemies.filter(e => !e.dead && e.stationary).length;

    if (!rs.cleared) {
      if (run.type === 'sobrevivencia') {
        rs.timer -= dt;
        rs.spawnTimer -= dt;
        const cap = 4 + run.floor;
        if (rs.spawnTimer <= 0 && alive < cap) {
          rs.spawnTimer = Math.max(1.4, 2.6 - run.floor * 0.4);
          const w = this.composeWave(1.6);
          this.spawnWave(w.slice(0, 1));
        }
        this.ui.objective(`Sobreviva: ${Math.max(0, rs.timer).toFixed(1)}s`);
        if (rs.timer <= 0) {
          for (const e of this.enemies) if (!e.dead) e.die();
          this.roomCleared();
        }
      } else {
        if (alive === 0 && towerAlive === 0) {
          if (rs.waveIdx < rs.waves.length - 1) {
            rs.waveIdx++;
            rs.started = 1.0;
            this.fx.callout('PRÓXIMA ONDA', '#ff5a6e', 0.8);
          } else this.roomCleared();
        }
        if (!rs.cleared) {
          const total = alive + towerAlive;
          let txt = run.type === 'duelo' ? `Duelo — apenas aparos ferem · ${total} restantes` : `Inimigos restantes: ${total}`;
          if (run.type === 'flechas') txt = `Reflita as flechas! Torres: ${towerAlive} · Chão: ${alive}`;
          if (rs.waves.length > 1) txt += ` · Onda ${rs.waveIdx + 1}/${rs.waves.length}`;
          this.ui.objective(txt);
        }
      }
    } else if (!rs.rewardGiven) {
      rs.rewardGiven = true;
      this.giveReward();
    } else if (rs.doorsOpen) {
      // Entrar num portal
      const p = this.player.pos;
      for (const d of this.room.doors) {
        if (Math.abs(p.x - d.x) < 1.5 && p.z < d.z + 1.3) { this.takeDoor(d.opt); break; }
      }
    }
  }

  roomCleared() {
    const rs = this.roomState;
    if (rs.cleared) return;
    rs.cleared = true;
    this.run.rooms++;
    this.addEcos(3);
    sfx.clear();
    if (this.run.type !== 'chefe') this.fx.callout('SALA LIMPA', '#9affd0', 1.0);
    this.ui.objective('Sala limpa');
    this.ui.boss(false);
  }

  giveReward() {
    const type = this.run.type;
    const reward = ROOM_TYPES[type].reward;
    if (type === 'chefe') {
      this.addEcos(30);
      this.player.heal(this.run.stats.maxHp);
      if (this.run.floor >= FLOORS.length - 1) { this.endRun(true); return; }
      this.fx.callout('ANDAR CONCLUÍDO', '#ffd34a', 1.6);
      this.offerBoons(2, 'Recompensa do Guardião');
      return;
    }
    if (reward === 'heal') {
      const h = Math.round(this.run.stats.maxHp * 0.4);
      this.player.heal(h);
      this.fx.number(this.player.pos, '+' + h, false, '#9affd0');
      this.offerBoons(0, 'Bênção do Santuário');
      return;
    }
    this.offerBoons(reward === 'boon+' ? 1 : 0);
  }

  offerBoons(minRarity, title = 'Escolha uma bênção') {
    const run = this.run;
    const n = this.save.meta.choice ? 4 : 3;
    const owned = new Set(run.boons.map(b => b.id));
    let pool = BOONS.filter(b => (b.stack || !owned.has(b.id)) && b.rarity >= minRarity);
    if (pool.length < n) pool = BOONS.filter(b => b.stack || !owned.has(b.id));
    const picks = [];
    const weights = b => [6, 3 + run.floor, 1 + run.floor][b.rarity] * (minRarity > 0 && b.rarity >= minRarity ? 1 : 1);
    while (picks.length < n && pool.length) {
      const tot = pool.reduce((a, b) => a + weights(b), 0);
      let r = Math.random() * tot;
      let idx = 0;
      for (let i = 0; i < pool.length; i++) { r -= weights(pool[i]); if (r <= 0) { idx = i; break; } }
      picks.push(pool[idx]);
      pool.splice(idx, 1);
    }
    this.state = 'choice';
    this.input.unlock();
    this.ui.showChoice(title, picks, (b) => this.takeBoon(b));
  }

  takeBoon(b) {
    this.run.boons.push(b);
    b.apply(this.run.stats, this.player);
    sfx.pickup();
    this.ui.boons(this.run.boons);
    this.state = 'playing';
    this.input.lock();
    this.openDoors();
  }

  openDoors() {
    const run = this.run;
    const rs = this.roomState;
    rs.doorsOpen = true;
    let options;
    if (run.type === 'chefe') {
      options = [{ type: 'combate', nextFloor: true }, { type: 'elite', nextFloor: true }];
    } else if (run.roomIndex + 1 >= ROOMS_PER_FLOOR) {
      options = [{ type: 'chefe' }];
    } else {
      const pool = [
        { type: 'combate', w: 4 }, { type: 'elite', w: 2 }, { type: 'sobrevivencia', w: 2 },
        { type: 'duelo', w: 2 }, { type: 'flechas', w: 2 },
      ];
      if (run.roomIndex >= 1 && run.type !== 'santuario') pool.push({ type: 'santuario', w: 1.5 });
      const n = Math.random() < 0.5 ? 3 : 2;
      options = [];
      const avail = pool.filter(p => p.type !== run.type || p.type === 'combate');
      while (options.length < n && avail.length) {
        const tot = avail.reduce((a, b) => a + b.w, 0);
        let r = Math.random() * tot, idx = 0;
        for (let i = 0; i < avail.length; i++) { r -= avail[i].w; if (r <= 0) { idx = i; break; } }
        options.push({ type: avail[idx].type });
        avail.splice(idx, 1);
      }
    }
    const rewardText = { boon: 'Bênção', 'boon+': 'Bênção rara', heal: 'Cura + bênção', boss: 'Fim do andar' };
    for (const o of options) o.rewardText = o.nextFloor ? 'Próximo andar' : rewardText[ROOM_TYPES[o.type].reward];
    this.room.addDoors(options, ROOM_TYPES);
    this.ui.objective('Escolha um portal');
  }

  takeDoor(opt) {
    const run = this.run;
    sfx.door();
    this.fx.flash(0.8, '#000');
    if (opt.nextFloor) { run.floor++; run.roomIndex = 0; }
    else if (run.type !== 'chefe') run.roomIndex++;
    this.boss = null;
    this.enterRoom(opt.type);
  }

  addEcos(n) {
    const v = Math.round(n * (this.run ? this.run.stats.ecoMult : 1));
    this.run.ecos += v;
  }

  // ---------- Combate ----------
  playerStrike(combo) {
    const p = this.player, w = p.weapon, st = this.run.stats;
    const fwd = p.forward();
    const mult = w.comboMults[combo];
    const fury = st.fury ? 1 + p.fury * 0.1 : 1;
    let hitAny = false, critAny = false;
    for (const e of this.enemies) {
      if (e.dead || e.baseY > 1.5) continue;
      const to = new THREE.Vector3(e.pos.x - p.pos.x, 0, e.pos.z - p.pos.z);
      const d = to.length() - e.radius;
      if (d > w.range) continue;
      if (d > 0.6 && fwd.dot(to.normalize()) < w.arc) continue;
      let dmg = w.damage * st.dmgMult * mult * fury;
      let crit = false;
      if (p.critNext) { dmg *= (w.perfectDodgeCrit || 2); crit = true; }
      if (e.isStunned()) { dmg *= e.broken ? st.executeMult : st.riposteMult; crit = true; }
      const postureDmg = 7 * w.postureMult * st.postureMult * mult;
      const pos = e.pos.clone(); pos.y = e.baseY + e.def.height * 0.6;
      if (this.roomState.duel && !e.isStunned() && !p.critNext) {
        e.addPosture(postureDmg * 1.5);
        e.flinch = 0.5;
        this.fx.number(e.pos, 'BLOQUEADO', false, '#999');
        this.fx.burst(pos, 0xcccccc, 5, 3, 0.25);
        sfx.parryWhiff();
        hitAny = true;
        continue;
      }
      dmg = Math.round(dmg);
      e.takeDamage(dmg, to, w.id === 'martelo' ? 9 : 4);
      if (!e.dead) e.addPosture(postureDmg);
      this.fx.number(e.pos, String(dmg), crit);
      this.fx.burst(pos, crit ? 0xffd34a : 0xff4a5a, crit ? 18 : 9, crit ? 7 : 5, 0.4);
      hitAny = true; critAny = critAny || crit;
    }
    if (hitAny) {
      this.hitstop = Math.max(this.hitstop, critAny ? 0.09 : 0.045);
      this.fx.addShake(critAny ? 0.25 : 0.1);
      critAny ? sfx.crit() : sfx.hit();
      p.critNext = false;
    }
    if (combo === 2) {
      if (w.slamFinisher) {
        const c = p.pos.clone().addScaledVector(fwd, 2);
        this.fx.ring(c, 0xffb27a, 4.5, 0.35);
        this.fx.addShake(0.3);
        sfx.slam();
        for (const e of this.enemies) {
          if (e.dead || e.baseY > 1.5) continue;
          if (Math.hypot(e.pos.x - c.x, e.pos.z - c.z) < 4.5 + e.radius && !this.roomState.duel) {
            const dmg = Math.round(w.damage * st.dmgMult * 0.5);
            e.takeDamage(dmg, new THREE.Vector3(e.pos.x - c.x, 0, e.pos.z - c.z).normalize(), 8);
            if (!e.dead) e.addPosture(20 * st.postureMult);
            this.fx.number(e.pos, String(dmg));
          }
        }
      }
      if (st.slashWave) {
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        const pr = new Projectile(this, p.eye().addScaledVector(dir, 0.8).add(new THREE.Vector3(0, -0.3, 0)), dir.multiplyScalar(26), w.damage * st.dmgMult * 0.8, false, null);
        pr.reflected = true;
        pr.mesh.material.color.set(0xffffff);
        pr.trail.color.set(0xffffff);
        pr.mesh.scale.set(4, 0.4, 1);
        this.projectiles.push(pr);
      }
    }
  }

  // Resolve um golpe inimigo contra o jogador.
  enemyStrike(e, atk) {
    const p = this.player;
    const to = new THREE.Vector3(p.pos.x - e.pos.x, 0, p.pos.z - e.pos.z);
    const d = to.length();
    const reach = atk.reach + p.radius;
    let inRange = d <= reach;
    if (inRange && atk.kind !== 'slam' && d > 1.0) inRange = e.forward().dot(to.normalize()) >= Math.cos(atk.arc);
    if (p.pos.y > 2.0) inRange = false;
    if (!inRange) return 'miss';
    if (p.isInvulnerable()) {
      if (p.isPerfectDodge()) this.perfectDodge();
      return 'dodged';
    }
    if (p.isParrying() && !atk.unparryable) {
      this.parry(e, atk);
      return 'parried';
    }
    if (p.isParrying() && atk.unparryable) this.fx.callout('INAPARÁVEL!', '#ff8a00', 0.5);
    this.damagePlayer(atk.damage * e.dmgMult, e);
    return 'hit';
  }

  parry(e, atk) {
    const p = this.player, st = this.run.stats, w = p.weapon;
    this.run.parries++;
    sfx.parry();
    this.fx.flash(0.3);
    this.hitstop = Math.max(this.hitstop, 0.13);
    this.fx.addShake(0.2);
    p.parryFlash = 1;
    p.parryCooldown = 0;
    if (st.fury) p.fury = Math.min(6, p.fury + 1);
    const spark = p.eye().addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion), 0.9);
    this.fx.burst(spark, 0xffe08a, 22, 7, 0.45, 0.8);
    this.fx.callout('APARO!', '#ffd34a', 0.45);
    if (e) {
      const postureDmg = 30 * (atk.posture || 1) * w.postureMult * st.postureMult;
      e.onParried(postureDmg);
      if (this.roomState.duel) {
        const dmg = Math.round(14 * st.dmgMult);
        e.takeDamage(dmg);
        this.fx.number(e.pos, String(dmg), true);
      }
    }
    if (st.parryHeal) { p.heal(st.parryHeal); }
    if (st.parryShockwave) this.areaDamage(p.pos, 5, st.parryShockwave, 0xffd34a);
  }

  perfectDodge() {
    const p = this.player, st = this.run.stats;
    if (p.perfectUsed === p.dodgeId) return; // uma vez por esquiva
    p.perfectUsed = p.dodgeId;
    this.run.perfectDodges++;
    this.slowmo = st.slowmo;
    p.critNext = true;
    p.dashCharges = Math.min(p.maxDash(), p.dashCharges + 1);
    if (st.fury) p.fury = Math.min(6, p.fury + 1);
    sfx.perfectDodge();
    this.fx.callout('ESQUIVA PERFEITA', '#5ce1ff', 0.8);
    this.fx.flash(0.2, '#5ce1ff');
    if (st.dodgeExplosion) this.areaDamage(p.pos, 4.5, st.dodgeExplosion, 0x5ce1ff);
  }

  areaDamage(center, radius, dmg, color) {
    this.fx.ring(center.clone(), color, radius, 0.35);
    sfx.explosion();
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (Math.hypot(e.pos.x - center.x, e.pos.z - center.z) < radius + e.radius) {
        const d = Math.round(dmg * this.run.stats.dmgMult);
        e.takeDamage(d, new THREE.Vector3(e.pos.x - center.x, 0, e.pos.z - center.z).normalize(), 6);
        if (!e.dead) e.addPosture(15);
        this.fx.number(e.pos, String(d), false, '#' + new THREE.Color(color).getHexString());
      }
    }
  }

  damagePlayer(dmg, src) {
    const p = this.player;
    if (p.hurtCooldown > 0 || p.dead) return;
    dmg = Math.round(dmg);
    p.hp -= dmg;
    p.hurtCooldown = 0.4;
    p.fury = 0;
    this.fx.hurt();
    this.fx.addShake(0.35);
    sfx.hurt();
    if (src && this.run.stats.thorns && !src.dead) {
      src.takeDamage(this.run.stats.thorns);
      this.fx.number(src.pos, String(this.run.stats.thorns), false, '#9affd0');
    }
    if (p.hp <= 0) {
      if (this.run.stats.revives > 0) {
        this.run.stats.revives--;
        p.hp = Math.round(this.run.stats.maxHp * 0.5);
        this.fx.callout('RENASCIDO', '#ff7af5', 1.4);
        this.fx.flash(0.8, '#ff7af5');
        this.areaDamage(p.pos, 6, 40, 0xff7af5);
        p.hurtCooldown = 1.5;
      } else {
        p.dead = true;
        this.endRun(false);
      }
    }
  }

  spawnProjectile(pos, vel, damage, unparryable, owner) {
    this.projectiles.push(new Projectile(this, pos, vel, damage, unparryable, owner));
  }

  spawnShockwave(pos, cfg, owner) {
    if (!cfg) return;
    this.waves.push(new Shockwave(this, pos, cfg, owner));
  }

  projectileVsPlayer(pr) {
    if (pr.ignorePlayer) return;
    const p = this.player;
    const c = p.eye(); c.y -= 0.5;
    if (pr.pos.distanceTo(c) > 0.9) return;
    if (p.isParrying() && !pr.unparryable) {
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      pr.reflect(dir, this.run.stats.reflectMult, this.run.stats.reflectHoming);
      pr.pos.copy(p.eye()).addScaledVector(dir, 1.0);
      sfx.reflect();
      this.parry(null, null);
      return;
    }
    if (p.isInvulnerable()) {
      if (p.isPerfectDodge()) this.perfectDodge();
      pr.ignorePlayer = true;
      return;
    }
    this.damagePlayer(pr.damage, null);
    pr.kill();
  }

  projectileHitEnemy(pr, e) {
    const st = this.run.stats;
    const dmg = Math.round(pr.damage * (pr.owner ? st.dmgMult : 1));
    e.takeDamage(dmg, pr.vel.clone().setY(0).normalize(), 5);
    if (!e.dead) e.addPosture(25 * st.postureMult);
    this.fx.number(e.pos, String(dmg), true, '#5ce1ff');
    sfx.crit();
    this.hitstop = Math.max(this.hitstop, 0.05);
  }

  waveVsPlayer(w) {
    const p = this.player;
    if (p.isInvulnerable()) {
      if (p.isPerfectDodge()) this.perfectDodge();
      return true;
    }
    if (p.hurtCooldown > 0) return false;
    this.damagePlayer(w.damage, null);
    return true;
  }

  onEnemyKilled(e) {
    this.run.kills++;
    this.addEcos(e.def.boss ? 0 : e.elite ? 4 : 1);
    const st = this.run.stats;
    if (st.killHeal) this.player.heal(st.killHeal);
    this.fx.burst(e.pos.clone().setY(1), e.elite ? 0xff7af5 : 0x9a8cff, 25, 6, 0.8);
    if (e === this.boss) {
      this.ui.boss(false);
      this.slowmo = 1.5;
      this.fx.callout('GUARDIÃO DERROTADO', '#ffd34a', 2);
      for (const o of this.enemies) if (!o.dead && o !== e) o.die();
    }
  }

  // ---------- Estados ----------
  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.ui.pause(true, this.run);
  }
  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.ui.pause(false);
    this.input.lock();
    this.last = performance.now();
  }

  endRun(win) {
    const run = this.run;
    if (win) this.addEcos(50);
    this.state = win ? 'win' : 'dead';
    this.save.ecos += run.ecos;
    if (win) this.save.wins++;
    const depth = run.floor * (ROOMS_PER_FLOOR + 1) + run.roomIndex + 1;
    this.save.best = Math.max(this.save.best || 0, depth);
    writeSave(this.save);
    this.input.unlock();
    this.ui.boss(false);
    const t = Math.round((performance.now() - run.startTime) / 1000);
    this.ui.end(win, {
      'Andar alcançado': `${run.floor + 1} — ${FLOORS[run.floor].name}`,
      'Salas concluídas': run.rooms,
      'Abates': run.kills,
      'Aparos': run.parries,
      'Esquivas perfeitas': run.perfectDodges,
      'Bênçãos': run.boons.length,
      'Tempo': `${Math.floor(t / 60)}m ${t % 60}s`,
      'Ecos ganhos': '◈ ' + run.ecos,
    });
  }

  quitToMenu() {
    this.state = 'menu';
    this.input.unlock();
    this.clearEntities();
    if (this.player) { this.player.dispose(); this.player = null; }
    this.run = null;
    this.buildRoom('open', FLOORS[0]);
    this.camera.position.set(0, 3, 12);
    this.camera.rotation.set(0, 0, 0);
    this.ui.showHUD(false);
  }

  // ---------- Loop ----------
  frame() {
    const now = performance.now();
    let realDt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.elapsed += realDt;
    this.step(realDt);
    this.renderer.render(this.scene, this.camera);
  }

  step(realDt) {
    if (this.state === 'menu') {
      const t = this.elapsed * 0.15;
      this.camera.position.set(Math.sin(t) * 12, 3.5, Math.cos(t) * 12);
      this.camera.lookAt(0, 1.5, 0);
      this.fx.update(realDt, realDt);
      return;
    }
    if (this.state !== 'playing') {
      this.input.endFrame();
      this.input.takeMouse();
      return;
    }

    // Câmera lenta e hitstop
    if (this.slowmo > 0) this.slowmo -= realDt;
    const targetScale = this.slowmo > 0 ? SLOWMO_SCALE : 1;
    this.timeScale += (targetScale - this.timeScale) * Math.min(1, realDt * 12);
    let dt = realDt * this.timeScale;
    let pdt = realDt * (this.slowmo > 0 ? 0.8 : this.timeScale);
    if (this.hitstop > 0) { this.hitstop -= realDt; dt = 0; pdt = 0; }
    this.canvas.style.filter = this.slowmo > 0 ? 'saturate(0.35) contrast(1.15) hue-rotate(-10deg)' : '';

    const p = this.player;
    p.update(pdt, this.input, this);
    for (const e of this.enemies) e.update(dt);
    this.enemies = this.enemies.filter(e => !e.removed);
    for (const pr of this.projectiles) pr.update(dt);
    this.projectiles = this.projectiles.filter(pr => !pr.dead);
    for (const w of this.waves) w.update(dt);
    this.waves = this.waves.filter(w => !w.dead);
    if (this.state !== 'playing') return; // morreu durante o passo

    this.updateRoom(dt);
    this.room.update(this.elapsed);
    this.fx.update(dt, realDt);

    // Tremor de câmera
    if (this.fx.shake > 0) {
      const s = this.fx.shake * 0.08;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
    this.ui.hud(this);
    this.input.endFrame();
  }
}

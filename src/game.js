import * as THREE from 'three';
import { Input } from './input.js';
import { FX } from './fx.js';
import { Room } from './world.js';
import { Player } from './player.js';
import { Enemy, Projectile, Shockwave } from './enemies.js';
import { sfx } from './audio.js';
import { CLASSES, BOONS, baseStats, ROOM_TYPES, FLOORS, HUB_THEME, loadSave, writeSave } from './data.js';
import { createCharacter } from './models.js';
import { DialogueUI } from './dialogue.js';
import { CONSELHOS, RETORNOS, SAUDACOES } from './story.js';
import { applySkills, ABILITY_INFO } from './skills.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];

// Personagem não-hostil (ex.: Mestre Rafael). Olha para o jogador e gesticula ao falar.
class Npc {
  constructor(game, key, name, pos, procOpts) {
    this.game = game;
    this.name = name;
    this.pos = pos.clone();
    this.model = createCharacter(key, procOpts);
    this.model.root.position.copy(pos);
    this.facing = 0;
    this.talking = false;
    game.scene.add(this.model.root);
  }
  update(dt) {
    const p = this.game.player;
    if (p) {
      const want = Math.atan2(-(p.pos.x - this.pos.x), -(p.pos.z - this.pos.z));
      let d = want - this.facing;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (p.pos.distanceTo(this.pos) < 8) this.facing += d * Math.min(1, dt * 3);
    }
    this.model.root.rotation.y = this.facing;
    this.model.play(this.talking ? 'talk' : 'idle');
    this.model.update(dt);
  }
  dispose() { this.model.dispose(); }
}

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
    this.dialogue = new DialogueUI();
    this.npcs = [];

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
  // Atributos base + melhorias permanentes + árvore de habilidades do caminho atual.
  computeStats() {
    const cls = this.currentClass();
    return applySkills(baseStats(this.save.meta), this.save, cls && cls.id);
  }

  // Depois de comprar habilidades no mosteiro, recria o jogador com os novos atributos.
  refreshHubStats() {
    if (!this.run || !this.run.isHub) return;
    this.run.stats = this.computeStats();
    this.makePlayer(this.currentClass(), this.run.stats);
  }

  currentClass() { return this.save.story.classe ? CLASSES[this.save.story.classe] : null; }

  // Recria o jogador (troca de classe muda a câmera e o modelo).
  makePlayer(cls, stats) {
    const old = this.player;
    if (old) old.dispose();
    this.player = new Player(this, cls, stats);
    if (old) { this.player.pos.copy(old.pos); this.player.yaw = old.yaw; this.player.pitch = old.pitch; this.player.facing = old.yaw; }
    this.ui.weapon(cls ? `${cls.name} · ${cls.path}` : 'Aprendiz');
  }

  // ---------- Mosteiro (hub) ----------
  enterHub(reason = null) {
    if (this.menuHero) { this.menuHero.dispose(); this.menuHero = null; }
    this.camera.clearViewOffset();
    this.run = {
      isHub: true, type: 'hub', floor: 0, roomIndex: 0, stats: this.computeStats(), boons: [], ecos: 0,
      kills: 0, parries: 0, perfectDodges: 0, rooms: 0, startTime: performance.now(),
    };
    this.buildRoom('hub', HUB_THEME);
    this.player = null;
    this.makePlayer(this.currentClass(), this.run.stats);
    const p = this.player;
    this.roomState = { hub: true, cleared: true, rewardGiven: true, doorsOpen: true, duel: false, started: 0, waves: [] };
    this.room.addDoors([{ type: 'profundezas', rewardText: 'Descer' }], ROOM_TYPES);
    this.master = new Npc(this, 'mestre', 'Mestre Rafael', new THREE.Vector3(-3.2, 0, -0.5), {
      height: 1.75, color: 0x4a3a2e, skin: 0xc89a78, robe: 0x6a5030, beard: 0xe8e4dc, hood: 0x3a2c20, weapon: 'staff', eyeColor: 0xe8c27a,
    });
    this.npcs.push(this.master);
    this.room.pillars.push({ x: this.master.pos.x, z: this.master.pos.z, r: 0.5, h: 2 });
    this.spawnEnemy('boneco', new THREE.Vector3(5, 0, 1), { stationary: true });
    // Começa perto do Mestre, olhando para ele
    p.pos.set(-1.2, 0, 3.2);
    p.yaw = Math.atan2(-(this.master.pos.x - p.pos.x), -(this.master.pos.z - p.pos.z));
    p.facing = p.yaw; p.pitch = 0.05;
    this.ui.showHUD(true);
    this.ui.boons([]);
    this.ui.roomName('Mosteiro do Eco');
    this.ui.objective(this.currentClass() ? 'Fale com o Mestre ou desça pelo portal' : '');
    this.state = 'playing';
    this.input.lock();
    const st = this.save.story;
    if (!st.prologo) this.startDialogue('prologo', () => { st.prologo = true; writeSave(this.save); this.ui.objective('Pratique no boneco ou desça pelo portal'); });
    else if (reason === 'morte') this.startDialogue('retorno_morte');
    else if (reason === 'vitoria') this.startDialogue('retorno_vitoria');
  }

  // ---------- Diálogos ----------
  startDialogue(id, onDone) {
    this.state = 'dialogue';
    this.input.unlock();
    if (this.player) this.player.locked = true;
    if (this.master && /mestre|prologo|retorno|conselho|trocar|licao|escolha|sobre/.test(id)) this.master.talking = true;
    this.ui.prompt(null);
    const cls = () => this.currentClass();
    const ctx = {
      caminho: () => (cls() ? cls().path : 'nenhum caminho'),
      classe: () => (cls() ? cls().name : ''),
      mortes: () => this.save.deaths || 0,
      saudacao: () => pick(SAUDACOES),
      conselho: () => pick(CONSELHOS),
      retorno: () => pick(RETORNOS),
    };
    this.dialogue.run(id, ctx, (a) => this.dialogueAction(a), () => {
      if (this.master) this.master.talking = false;
      if (this.player) this.player.locked = false;
      this.input.pressed.clear(); // a tecla que fechou o diálogo não deve virar pulo/interação
      this.last = performance.now();
      if (this.pendingMeta) {
        const which = this.pendingMeta;
        this.pendingMeta = false;
        this.state = 'meta';
        const back = () => { this.refreshHubStats(); this.state = 'playing'; this.input.lock(); this.last = performance.now(); };
        if (which === 'skills') this.ui.openSkills(this.currentClass().id, back);
        else this.ui.openMeta(back);
        return;
      }
      this.state = 'playing';
      if (onDone) onDone();
      if (this.state === 'playing') this.input.lock();
    });
  }

  dialogueAction(action) {
    if (action.startsWith('classe:')) {
      const id = action.split(':')[1];
      this.save.story.classe = id;
      writeSave(this.save);
      this.makePlayer(CLASSES[id], this.run.stats);
      this.player.locked = true;
    } else if (action === 'meta' || action === 'skills') {
      this.pendingMeta = action;
      this.dialogue.finish();
    }
  }

  // ---------- Run ----------
  startRun() {
    const cls = this.currentClass();
    this.run = {
      cls, floor: 0, roomIndex: 0, type: 'combate',
      stats: this.computeStats(), boons: [], ecos: 0,
      kills: 0, parries: 0, perfectDodges: 0, rooms: 0, startTime: performance.now(),
    };
    this.makePlayer(cls, this.run.stats);
    this.save.runs++;
    writeSave(this.save);
    this.ui.showHUD(true);
    this.ui.boons([]);
    this.enterRoom('combate');
    this.state = 'playing';
    if (!this.input.locked) this.input.lock();
  }

  buildRoom(layout, theme) {
    this.clearEntities();
    if (this.room) this.room.dispose();
    const size = layout === 'boss' ? 40 : layout === 'towers' ? 36 : layout === 'hub' ? 30 : 34;
    this.room = new Room(this.scene, theme, layout, size);
    this.scene.fog = new THREE.Fog(theme.fog, 18, 75);
    this.scene.background = new THREE.Color(theme.fog);
    this.hemi.color.set(theme.light);
    this.hemi.intensity = theme.hemi ?? 2.2;
  }

  clearEntities() {
    this.mines = [];
    for (const n of this.npcs) n.dispose();
    this.npcs = [];
    this.master = null;
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
    p.yaw = 0; p.pitch = 0; p.facing = 0;
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
      rs.preDialogue = 'arauto_intro_' + f;
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
    if (rs.hub) return this.updateHub();
    if (rs.started > 0) {
      rs.started -= dt;
      if (rs.started <= 0) {
        if (rs.preDialogue) { const id = rs.preDialogue; rs.preDialogue = null; rs.started = 0.4; this.startDialogue(id); }
        else if (rs.waves.length) this.spawnWave(rs.waves[rs.waveIdx]);
      }
      return;
    }
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

  updateHub() {
    const p = this.player;
    const near = this.master && p.pos.distanceTo(this.master.pos) < 2.8;
    this.ui.prompt(near ? '[E] Falar com Mestre Rafael' : null);
    if (near && this.input.consume('KeyE')) { this.startDialogue('mestre_menu'); return; }
    for (const d of this.room.doors) {
      if (Math.abs(p.pos.x - d.x) < 1.5 && p.pos.z < d.z + 1.3) {
        if (!this.currentClass()) { p.pos.z += 2; this.startDialogue('trocar'); return; }
        sfx.door();
        this.fx.flash(0.8, '#000');
        this.ui.prompt(null);
        this.startRun();
        return;
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
      this.save.story.bosses = Math.max(this.save.story.bosses || 0, this.run.floor + 1);
      if (this.run.floor >= FLOORS.length - 1) { this.endRun(true); return; }
      this.fx.callout('ANDAR CONCLUÍDO', '#ffd34a', 1.6);
      this.startDialogue('arauto_derrota_' + this.run.floor, () => this.offerBoons(2, 'Recompensa do Guardião'));
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
    if (w.attack === 'bolt') return this.castBolt(combo);
    const fwd = p.aimForward();
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
      if (st.counterHit && p.counterT > 0) { dmg *= 2; crit = true; p.heal(4); }
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
      e.takeDamage(dmg, to, combo === 2 ? 8 : 4);
      if (!e.dead) e.addPosture(postureDmg);
      this.fx.number(e.pos, String(dmg), crit);
      this.fx.burst(pos, crit ? 0xffd34a : 0xff4a5a, crit ? 18 : 9, crit ? 7 : 5, 0.4);
      hitAny = true; critAny = critAny || crit;
      this.addResonance(3);
    }
    if (hitAny) {
      this.hitstop = Math.max(this.hitstop, critAny ? 0.09 : 0.045);
      this.fx.addShake(critAny ? 0.25 : 0.1);
      critAny ? sfx.crit() : sfx.hit();
      p.critNext = false;
      p.counterT = 0;
    }
    if (combo === 2) {
      if (w.finisher) {
        const R = w.finisher.radius * st.quakeMult;
        const c = p.pos.clone().addScaledVector(fwd, 1.5);
        this.fx.ring(c, w.color, R, 0.35);
        this.fx.addShake(0.3);
        sfx.slam();
        for (const e of this.enemies) {
          if (e.dead || e.baseY > 1.5) continue;
          if (Math.hypot(e.pos.x - c.x, e.pos.z - c.z) < R + e.radius && !this.roomState.duel) {
            const dmg = Math.round(w.damage * st.dmgMult * w.finisher.mult);
            e.takeDamage(dmg, new THREE.Vector3(e.pos.x - c.x, 0, e.pos.z - c.z).normalize(), 8);
            if (!e.dead) e.addPosture(20 * st.postureMult * st.quakeMult);
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

  // Mago: dardo arcano disparado da mão em direção à mira.
  castBolt(combo) {
    const p = this.player, w = p.cls, st = this.run.stats;
    const heavy = combo === 2;
    const origin = p.muzzle(combo);
    const aim = this.aimAssist(origin, 0.985);
    const target = origin.clone().addScaledVector(aim, 40);
    const fury = st.fury ? 1 + p.fury * 0.1 : 1;
    let dmg = w.damage * st.dmgMult * w.comboMults[combo] * fury;
    let crit = false;
    if (p.critNext) { dmg *= (w.perfectDodgeCrit || 2); crit = true; p.critNext = false; }
    else if (st.ecoTemporal && this.slowmo > 0) { dmg *= 2; crit = true; }
    const shoot = (angle) => {
      const dir = target.clone().sub(origin).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      const pr = new Projectile(this, origin.clone(), dir.multiplyScalar(w.boltSpeed * (heavy ? 0.8 : 1)), dmg * (angle ? 0.5 : 1), false, null);
      pr.reflected = true;
      pr.playerShot = true;
      pr.crit = crit;
      pr.posture = 6 * w.postureMult * st.postureMult * w.comboMults[combo] * (heavy ? 2 * st.orbMult : 1);
      pr.aoe = heavy ? 2.4 * st.orbMult : 0;
      pr.pierce = st.pierce;
      pr.mesh.material.color.set(heavy ? 0xd8c8ff : w.color);
      pr.trail.color.set(w.color);
      if (heavy) pr.mesh.scale.set(2, 2, 3);
      this.projectiles.push(pr);
    };
    shoot(0);
    if (heavy && st.slashWave) { shoot(0.18); shoot(-0.18); }
    sfx.shoot();
    if (heavy) this.fx.addShake(0.08);
  }

  // ---------- Habilidades da árvore ----------
  addResonance(v) {
    const p = this.player;
    if (!p || !this.run.stats.ultimate) return;
    const before = p.res;
    p.res = Math.min(100, p.res + v);
    if (before < 100 && p.res >= 100) { this.fx.callout('RESSONÂNCIA PLENA [V]', '#e8c27a', 0.8); sfx.pickup(); }
  }

  nearestEnemy(pos, maxD, exclude = null) {
    let best = null, bd = maxD;
    for (const e of this.enemies) {
      if (e.dead || (exclude && exclude.has(e))) continue;
      const d = e.pos.distanceTo(pos);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  enemyCenter(e) { const c = e.pos.clone(); c.y = e.baseY + e.def.height * 0.6; return c; }

  // Dano de habilidade: respeita atordoamento e o modo Duelo (lá só quebra postura).
  skillHit(e, base, posture, color, knock = null) {
    const st = this.run.stats;
    let dmg = base * st.dmgMult, crit = false;
    if (e.isStunned()) { dmg *= e.broken ? st.executeMult : st.riposteMult; crit = true; }
    if (this.roomState.duel && !e.isStunned()) { e.addPosture(posture * 1.5); this.fx.number(e.pos, 'BLOQUEADO', false, '#999'); return; }
    dmg = Math.round(dmg);
    e.takeDamage(dmg, knock, knock ? 6 : 0);
    if (!e.dead) e.addPosture(posture * st.postureMult);
    this.fx.number(e.pos, String(dmg), crit, crit ? null : color);
  }

  useAbilityR() {
    const p = this.player, st = this.run.stats;
    if (!st.abilityR) return;
    if (p.cdR > 0) { sfx.parryWhiff(); return; }
    const info = ABILITY_INFO[st.abilityR];
    if (st.abilityR === 'raio') {
      const origin = p.muzzle(0);
      const fwd = p.aimDir3();
      const camPos = new THREE.Vector3(); this.camera.getWorldPosition(camPos);
      let first = null, bestDot = 0.85;
      for (const e of this.enemies) {
        if (e.dead || e.pos.distanceTo(p.pos) > 26) continue;
        const dot = this.enemyCenter(e).sub(camPos).normalize().dot(fwd);
        if (dot > bestDot) { bestDot = dot; first = e; }
      }
      first = first || this.nearestEnemy(p.pos, 12);
      if (!first) { this.fx.callout('SEM ALVO', '#999', 0.4); return; }
      const hit = new Set();
      const pts = [origin];
      let cur = first;
      for (let i = 0; i < 4 && cur; i++) {
        hit.add(cur);
        pts.push(this.enemyCenter(cur));
        this.skillHit(cur, 28, 18, '#bfa8ff');
        this.fx.burst(this.enemyCenter(cur), 0xbfa8ff, 10, 5, 0.3);
        cur = this.nearestEnemy(cur.pos, 7, hit);
      }
      this.fx.beam(pts, 0xd8c8ff, 0.3);
      sfx.reflect(); this.hitstop = Math.max(this.hitstop, 0.05);
    } else if (st.abilityR === 'dragao') {
      p.dragonDash();
      this.dragonHits = new Set();
      sfx.dodge(); sfx.swing();
      this.fx.callout('INVESTIDA DO DRAGÃO', '#ffb27a', 0.5);
    }
    p.cdR = info.cooldown;
    this.addResonance(5);
  }

  useUltimate() {
    const p = this.player, st = this.run.stats;
    if (!st.ultimate) return;
    if (p.res < 100) { this.fx.callout('RESSONÂNCIA INSUFICIENTE', '#999', 0.5); return; }
    p.res = 0;
    this.ultTick = 0;
    this.fx.flash(0.4, '#e8c27a');
    this.fx.addShake(0.4);
    sfx.slam();
    if (st.ultimate === 'tempestade') { p.stormT = 3; this.fx.callout('TEMPESTADE DE ECOS', '#bfa8ff', 1.0); }
    else if (st.ultimate === 'cem') { p.flurryT = 2; p.attackT = -1; this.fx.callout('CEM PUNHOS', '#ffb27a', 1.0); }
  }

  onPlayerDodge() {
    const st = this.run && this.run.stats;
    if (st && st.dodgeMine) (this.mines = this.mines || []).push({ pos: this.player.pos.clone(), t: 0.55 });
  }

  updateAbilities(dt) {
    const p = this.player, st = this.run.stats;
    // Investida do Dragão: acerta quem estiver no caminho
    if (p.dragonT > 0 && this.dragonHits) {
      for (const e of this.enemies) {
        if (e.dead || e.baseY > 1.5 || this.dragonHits.has(e)) continue;
        if (Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < e.radius + 1.4) {
          this.dragonHits.add(e);
          this.skillHit(e, 35, 25, '#ffb27a', e.pos.clone().sub(p.pos).setY(0).normalize());
          this.fx.burst(this.enemyCenter(e), 0xffb27a, 14, 6, 0.35);
          sfx.crit(); this.hitstop = Math.max(this.hitstop, 0.04);
        }
      }
      this.fx.burst(p.pos.clone().setY(1), 0xffb27a, 2, 2, 0.3);
    }
    // Golpes supremos
    if (p.stormT > 0 || p.flurryT > 0) {
      this.ultTick -= dt;
      if (this.ultTick <= 0) {
        if (p.stormT > 0) {
          this.ultTick = 0.12;
          const near = this.enemies.filter(e => !e.dead && e.pos.distanceTo(p.pos) < 16);
          if (near.length) {
            const e = near[Math.floor(Math.random() * near.length)];
            const c = this.enemyCenter(e);
            this.fx.beam([c.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 12, (Math.random() - 0.5) * 2)), c], 0xd8c8ff, 0.18);
            this.skillHit(e, 14, 10, '#bfa8ff');
            sfx.hit();
          }
        } else {
          this.ultTick = 0.09;
          const fwd = p.aimForward();
          p.faceAim();
          let any = false;
          for (const e of this.enemies) {
            if (e.dead || e.baseY > 1.5) continue;
            const to = new THREE.Vector3(e.pos.x - p.pos.x, 0, e.pos.z - p.pos.z);
            if (to.length() - e.radius > 3.2 || fwd.dot(to.normalize()) < 0.3) continue;
            this.skillHit(e, 7, 6, '#ffb27a');
            any = true;
          }
          if (any) { sfx.hit(); this.fx.burst(p.pos.clone().addScaledVector(fwd, 1.5).setY(1.3), 0xffd0a0, 6, 5, 0.25); }
          else sfx.swing();
        }
      }
    }
    // Runas do Rastro Arcano
    if (this.mines && this.mines.length) {
      for (const m of this.mines) {
        m.t -= dt;
        if (m.t <= 0) this.areaDamage(m.pos, 3, st.dodgeMine, 0xbfa8ff);
      }
      this.mines = this.mines.filter(m => m.t > 0);
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
    p.counterT = 1.2;
    this.addResonance(20);
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
    this.addResonance(25);
    if (st.contraEsquiva) {
      const e = this.nearestEnemy(p.pos, 6);
      if (e) {
        const d = Math.round(30 * st.dmgMult);
        e.takeDamage(d, e.pos.clone().sub(p.pos).setY(0).normalize(), 6);
        if (!e.dead) e.addPosture(30 * st.postureMult);
        this.fx.number(e.pos, String(d), true, '#5ce1ff');
        this.fx.beam([p.pos.clone().setY(1.2), e.pos.clone().setY(1.2)], 0x5ce1ff, 0.2);
        this.fx.burst(e.pos.clone().setY(1.2), 0x5ce1ff, 14, 6, 0.4);
        sfx.crit();
      }
    }
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
    if (dmg <= 0) { // boneco de treino
      p.hurtCooldown = 0.4;
      this.fx.callout('ATINGIDO', '#ff8a8a', 0.4);
      this.fx.hurt(); sfx.hurt(); p.onHurt();
      return;
    }
    dmg = Math.round(dmg * this.run.stats.damageTaken);
    p.onHurt();
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

  // Direção da mira a partir de `origin`, puxada para o inimigo mais perto do centro da tela.
  aimAssist(origin, cone = 0.97) {
    const camPos = new THREE.Vector3(); this.camera.getWorldPosition(camPos);
    const fwd = this.player.aimDir3();
    let best = null, bestDot = cone;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const c = e.pos.clone(); c.y = e.baseY + e.def.height * 0.6;
      const dot = c.clone().sub(camPos).normalize().dot(fwd);
      if (dot > bestDot) { bestDot = dot; best = c; }
    }
    if (best) return best.sub(origin).normalize();
    return camPos.addScaledVector(fwd, 40).sub(origin).normalize();
  }

  projectileVsPlayer(pr) {
    if (pr.ignorePlayer) return;
    const p = this.player;
    const c = p.eye(); c.y -= 0.5;
    if (pr.pos.distanceTo(c) > 0.9) return;
    if (p.isParrying() && !pr.unparryable) {
      const dir = this.aimAssist(p.eye());
      pr.reflect(dir, this.run.stats.reflectMult, this.run.stats.reflectHoming);
      pr.vel.multiplyScalar(this.run.stats.reflectSpeed);
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
    if (pr.playerShot) {
      let dmg = pr.damage, crit = !!pr.crit;
      const at = e.pos.clone(); at.y = e.baseY + e.def.height * 0.6;
      if (this.roomState.duel && !e.isStunned() && !crit) {
        e.addPosture(pr.posture * 1.5);
        this.fx.number(e.pos, 'BLOQUEADO', false, '#999');
        this.fx.burst(at, 0xcccccc, 5, 3, 0.25);
        return;
      }
      if (e.isStunned()) { dmg *= e.broken ? st.executeMult : st.riposteMult; crit = true; }
      dmg = Math.round(dmg);
      e.takeDamage(dmg, pr.vel.clone().setY(0).normalize(), 3);
      if (!e.dead) e.addPosture(pr.posture);
      this.fx.number(e.pos, String(dmg), crit, crit ? null : '#c8b8ff');
      this.fx.burst(at, this.player.cls.color, crit ? 16 : 8, 5, 0.35);
      this.addResonance(2);
      crit ? sfx.crit() : sfx.hit();
      this.hitstop = Math.max(this.hitstop, crit ? 0.07 : 0.03);
      if (pr.aoe) {
        this.fx.ring(pr.pos.clone().setY(0.1), this.player.cls.color, pr.aoe, 0.3);
        for (const o of this.enemies) {
          if (o === e || o.dead || o.pos.distanceTo(pr.pos) > pr.aoe + o.radius + 1) continue;
          const d2 = Math.round(dmg * 0.5);
          o.takeDamage(d2, o.pos.clone().sub(pr.pos).setY(0).normalize(), 4);
          if (!o.dead) o.addPosture(pr.posture * 0.5);
          this.fx.number(o.pos, String(d2));
        }
      }
      return;
    }
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
    if (win && !this.run.finalShown) {
      this.run.finalShown = true;
      this.startDialogue('final', () => this.endRun(true));
      return;
    }
    const run = this.run;
    if (win) this.addEcos(50);
    if (!win) this.save.deaths = (this.save.deaths || 0) + 1;
    this.save.story.last = win ? 'vitoria' : 'morte';
    this.state = win ? 'win' : 'dead';
    this.save.ecos += run.ecos;
    if (win) this.save.wins++;
    const depth = run.floor * (ROOMS_PER_FLOOR + 1) + run.roomIndex + 1;
    this.save.best = Math.max(this.save.best || 0, depth);
    writeSave(this.save);
    this.input.unlock();
    this.ui.boss(false);
    const t = Math.round((performance.now() - run.startTime) / 1000);
    this.ui.prompt(null);
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

  // Protagonista girando no fundo do menu.
  showMenuHero() {
    if (this.menuHero) this.menuHero.dispose();
    this.menuHero = createCharacter('protagonista', { height: 1.8, color: 0x3a3048, skin: 0xd9a882 });
    this.scene.add(this.menuHero.root);
  }

  quitToMenu() {
    this.state = 'menu';
    this.input.unlock();
    this.clearEntities();
    if (this.player) { this.player.dispose(); this.player = null; }
    this.run = null;
    this.ui.prompt(null);
    this.buildRoom('open', FLOORS[0]);
    this.camera.position.set(0, 3, 12);
    this.camera.rotation.set(0, 0, 0);
    this.ui.showHUD(false);
    this.showMenuHero();
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
      const t = this.elapsed * 0.25;
      this.camera.position.set(Math.sin(t) * 4.2, 1.7, Math.cos(t) * 4.2);
      this.camera.lookAt(0, 1.05, 0);
      if (this.menuHero) { this.menuHero.play('idle'); this.menuHero.update(realDt); }
      // Desloca a imagem para o herói ficar à direita do texto do menu
      if (innerWidth > 760) this.camera.setViewOffset(innerWidth, innerHeight, -innerWidth * 0.2, 0, innerWidth, innerHeight);
      else this.camera.clearViewOffset();
      this.fx.update(realDt, realDt);
      return;
    }
    if (this.state === 'dialogue') {
      for (const n of this.npcs) n.update(realDt);
      if (this.player) this.player.view.update(0, false, this.room);
      this.fx.update(0, realDt);
      this.room.update(this.elapsed);
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
    if (!p.locked && !p.dead) {
      if (this.input.consume('KeyR')) this.useAbilityR();
      if (this.input.consume('KeyV')) this.useUltimate();
    }
    this.updateAbilities(dt);
    for (const n of this.npcs) n.update(dt);
    for (const e of this.enemies) e.update(dt);
    this.enemies = this.enemies.filter(e => !e.removed);
    for (const pr of this.projectiles) pr.update(dt);
    this.projectiles = this.projectiles.filter(pr => !pr.dead);
    for (const w of this.waves) w.update(dt);
    this.waves = this.waves.filter(w => !w.dead);
    if (this.state !== 'playing') { this.input.endFrame(); return; } // morreu ou abriu diálogo durante o passo

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

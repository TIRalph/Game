// Grava o trailer quadro a quadro a partir da versão web (precisa de Playwright e de um servidor
// estático na raiz do repositório: python3 -m http.server 8123).
// Uso: node tools/trailer/record.cjs <pasta-de-saida> [largura] [altura] [--shots=s1,s2] [--every=N]
// Saída: <pasta>/frames/00000.jpg..., <pasta>/events.json (efeitos sonoros por quadro) e <pasta>/shots.json.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(process.argv[2] || 'trailer-out');
const W = +(process.argv[3] || 1920), H = +(process.argv[4] || 1080);
const onlyShots = (process.argv.find(a => a.startsWith('--shots=')) || '').slice(8).split(',').filter(Boolean);
const every = +((process.argv.find(a => a.startsWith('--every=')) || '--every=1').slice(8)); // pular quadros em testes
const FPS = 30;

// ---------------------------------------------------------------------------
// Código que roda dentro da página: utilidades do diretor
// ---------------------------------------------------------------------------
const PAGE_LIB = () => {
  const T = window.T = {};
  T.THREE = null;
  T.log = [];
  T.frame = 0;
  T.ready = (async () => {
    T.THREE = await import('three');
    const audio = await import('/src/audio.js');
    for (const k of Object.keys(audio.sfx)) {
      const fn = audio.sfx[k];
      audio.sfx[k] = (...a) => { T.log.push({ f: T.frame, s: k, a: a[0] === true ? 1 : 0 }); return fn(...a); };
    }
    // Sem transições de CSS (as capturas não são em tempo real)
    const st = document.createElement('style');
    st.textContent = `*{transition:none!important;animation:none!important}
      #trl{position:fixed;inset:0;z-index:50;pointer-events:none;font-family:'Inter Display','Inter',sans-serif;color:#fff}
      #trl .bar{position:absolute;left:0;right:0;height:11.5%;background:#000}
      #trl .bar.t{top:0} #trl .bar.b{bottom:0}
      #trl .lore{position:absolute;left:10%;right:10%;bottom:17%;text-align:center;font-family:'Caladea','Bitstream Charter',serif;font-style:italic;font-size:3.1vw;line-height:1.3;text-shadow:0 2px 18px #000,0 0 40px #000}
      #trl .cap{position:absolute;left:6%;bottom:16%;max-width:70%}
      #trl .cap .k{font-weight:900;font-size:5.6vw;letter-spacing:.06em;line-height:1;text-shadow:0 4px 30px rgba(0,0,0,.7)}
      #trl .cap .s{margin-top:1.1vw;font-weight:600;font-size:1.6vw;letter-spacing:.32em;text-transform:uppercase;opacity:.9;text-shadow:0 2px 10px #000}
      #trl .cap .line{width:6vw;height:.35vw;margin-bottom:1.2vw}
      #trl .end{position:absolute;inset:0;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;padding-left:8%}
      #trl .end .logo{font-weight:900;font-size:8.6vw;letter-spacing:.1em;line-height:1;background:linear-gradient(180deg,#fff,#a99cff);-webkit-background-clip:text;color:transparent;filter:drop-shadow(0 0 30px rgba(122,108,255,.45))}
      #trl .end .tag{margin-top:1.6vw;font-size:1.9vw;font-weight:600;letter-spacing:.28em;text-transform:uppercase;color:#cfc8ff}
      #trl .end .cta{margin-top:3.2vw;display:inline-block;padding:1vw 2.2vw;border:2px solid #e8c27a;color:#e8c27a;font-weight:800;font-size:1.6vw;letter-spacing:.2em;text-transform:uppercase}
      #trl .black{position:absolute;inset:0;background:#000}
      #trl .flash{position:absolute;inset:0;background:#fff}`;
    document.head.appendChild(st);
    const d = document.createElement('div');
    d.id = 'trl';
    d.innerHTML = `<div class="bar t"></div><div class="bar b"></div><div class="lore"></div>
      <div class="cap"><div class="line"></div><div class="k"></div><div class="s"></div></div>
      <div class="end"><div class="logo">ECO DA LÂMINA</div><div class="tag">Apare. Esquive. Lembre.</div><div class="cta">Jogue grátis no itch.io</div></div>
      <div class="flash"></div><div class="black"></div>`;
    document.body.appendChild(d);
    T.el = (s) => d.querySelector(s);
    T.overlay({});
  })();

  // Estado da sobreposição do trailer
  T.overlay = ({ bars = 0, lore = '', loreA = 0, cap = '', sub = '', capA = 0, capColor = '#ffd34a', end = 0, black = 0, flash = 0 }) => {
    T.el('.bar.t').style.opacity = T.el('.bar.b').style.opacity = bars;
    T.el('.lore').innerHTML = lore; T.el('.lore').style.opacity = loreA;
    T.el('.cap .k').innerHTML = cap; T.el('.cap .s').innerHTML = sub; T.el('.cap').style.opacity = capA;
    T.el('.cap .line').style.background = capColor; T.el('.cap .k').style.color = '#fff';
    T.el('.end').style.opacity = end; T.el('.end').style.display = end > 0 ? 'flex' : 'none';
    T.el('.black').style.opacity = black;
    T.el('.flash').style.opacity = flash;
  };
  // Fecha diálogo aberto e impede que a sala termine (sem tela de bênção no meio das cenas)
  T.clean = () => {
    if (game.dialogue.active) game.dialogue.finish();
    document.getElementById('dialogue').classList.add('hidden');
    game.roomCleared = () => {};
    game.fx.calloutTimer = 0;
  };
  T.hud = (on) => { document.getElementById('hud').classList.toggle('hidden', !on); };
  T.hideScreens = () => { for (const id of ['menu', 'meta', 'help', 'choice', 'pause', 'end', 'skills']) document.getElementById(id).classList.add('hidden'); };

  T.setSave = (classe, skills = {}) => {
    const s = game.save;
    s.story.prologo = true; s.story.classe = classe;
    s.skills = s.skills || {}; s.skills[classe] = skills;
    s.ecos = 260;
  };
  T.allSkills = (cls) => {
    const out = {};
    const trees = { mago: ['m_afiado:3', 'm_perfura', 'm_orbe', 'm_raio', 'm_amplo:2', 'm_espelho', 'm_explosivo', 'm_tempestade', 'm_longo', 'm_carga', 'm_rastro', 'm_temporal'],
      punhos: ['p_ferro:3', 'p_ritmo', 'p_terremoto', 'p_dragao', 'p_firme:2', 'p_contra', 'p_ossos', 'p_cem', 'p_leve', 'p_dupla', 'p_contraesq', 'p_pedra'] };
    for (const n of trees[cls]) { const [id, l] = n.split(':'); out[id] = +(l || 1); }
    return out;
  };
  // Inicia uma sala de run já preparada
  T.room = (classe, floor, type, skills) => {
    T.clean();
    T.setSave(classe, skills || {});
    game.startRun();
    game.run.floor = floor;
    game.enterRoom(type);
    game.roomState.preDialogue = null;
    game.input.locked = true;
    game.run.stats.maxHp = 1e6; game.player.hp = 1e6;
    T.hideScreens();
  };

  // Piloto automático: apara/esquiva no tempo certo e ataca o alvo mais próximo
  T.bot = (o = {}) => {
    const g = game, p = g.player, inp = g.input;
    inp.keys.clear();
    for (const e of g.enemies) {
      if (e.dead || e.state !== 'windup') continue;
      const remain = e.atk.windupTime - e.t;
      const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
      if (remain < 0.06 && remain > 0 && ['melee', 'slam', 'lunge'].includes(e.atk.kind) && d < 7) inp.pressed.add(e.atk.unparryable ? 'ShiftLeft' : 'KeyF');
    }
    for (const pr of g.projectiles) {
      if (pr.reflected || pr.dead) continue;
      const c = p.eye(); c.y -= 0.5;
      if (pr.pos.distanceTo(c) < 2.0) inp.pressed.add(pr.unparryable ? 'ShiftLeft' : 'KeyF');
    }
    for (const w of g.waves) {
      const d = Math.hypot(p.pos.x - w.pos.x, p.pos.z - w.pos.z);
      if (Math.abs(d - w.r) < 1.6 && d > w.r && p.grounded) inp.pressed.add('Space');
    }
    if (o.noAttack) return;
    let target = null, bd = 1e9;
    for (const e of g.enemies) {
      if (e.dead) continue;
      const d = e.pos.distanceTo(p.pos) + (e.stationary && !o.towers ? 40 : 0);
      if (d < bd) { bd = d; target = e; }
    }
    if (!target) return;
    const dist = Math.hypot(target.pos.x - p.pos.x, target.pos.z - p.pos.z);
    const wantYaw = Math.atan2(-(target.pos.x - p.pos.x), -(target.pos.z - p.pos.z));
    let dy = wantYaw - p.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    p.yaw += dy * (o.turn ?? 0.25);
    const eye = p.thirdPerson ? g.camera.position : p.eye();
    const wantPitch = target.stationary || !p.thirdPerson ? Math.atan2(target.pos.y + target.def.height * 0.6 - eye.y, dist + (p.thirdPerson ? 4 : 0)) : (o.pitch ?? -0.12);
    p.pitch += (wantPitch - p.pitch) * 0.25;
    const want = p.cls.attack === 'bolt' ? (o.range ?? 7) : 2.3;
    if (dist > want && !target.stationary) inp.keys.add('KeyW');
    if ((dist <= want + 1 || target.stationary || p.cls.attack === 'bolt') && T.frame % (o.attackEvery ?? 8) === 0 && !o.holdFire) inp.pressed.add('Mouse0');
  };

  T.step = (n = 1) => { for (let i = 0; i < n; i++) game.step(1 / 30); };
  T.cam = (pos, look) => { game.camera.position.copy(pos); game.camera.lookAt(look); };
  T.V = (x, y, z) => new T.THREE.Vector3(x, y, z);
  T.ease = (k) => k * k * (3 - 2 * k);
  T.fade = (f, n, fin = 6, fout = 6) => Math.min(1, f / fin, (n - 1 - f) / fout);
};

// ---------------------------------------------------------------------------
// Cenas. setup(): prepara. frame(f, n): avança o jogo e ajusta câmera/textos.
// ---------------------------------------------------------------------------
const SHOTS = [
  {
    id: 'sino', secs: 5.0,
    setup: () => {
      T.clean();
      T.setSave('punhos', {});
      game.enterHub();
      game.player.pos.set(9, 0, 9);
      T.hud(false); T.hideScreens();
      T.step(10);
    },
    frame: (f, n) => {
      T.step();
      const k = T.ease(f / (n - 1));
      T.cam(T.V(Math.sin(k * 0.6 - 0.3) * 5.5, 2.4 - k * 0.5, -4 + 6.5 - k * 2.4), T.V(0, 1.9, -4));
      const a = T.fade(f, n, 20, 10);
      T.overlay({ bars: 1, lore: 'O Sino do Eco guardava a memória do mundo.', loreA: Math.min(1, Math.max(0, (f - 12) / 15)) * T.fade(f, n, 1, 10), black: 1 - Math.min(1, f / 20) });
    },
  },
  {
    id: 'arauto', secs: 4.6,
    setup: () => {
      T.room('punhos', 1, 'chefe');
      game.roomState.started = 0;
      game.spawnWave(game.roomState.waves[0]);
      game.player.pos.set(0, 0, 18);
      game.boss.pos.set(0, 0, -6); game.boss.cooldown = 99;
      T.hud(false);
      T.step(2);
    },
    frame: (f, n) => {
      const b = game.boss;
      b.cooldown = f > n * 0.55 ? 0 : 99;
      T.step();
      const k = f / (n - 1);
      const head = T.V(b.pos.x, 2.6, b.pos.z);
      T.cam(T.V(b.pos.x + 1.6 - k * 1.2, 0.5 + k * 0.4, b.pos.z + 5.2 - k * 1.5), head);
      T.overlay({ bars: 1, lore: 'Até que o Arauto o partiu em três.', loreA: Math.min(1, f / 10) * T.fade(f, n, 1, 8) });
    },
  },
  {
    id: 'mestre', secs: 4.8,
    setup: () => {
      T.setSave('punhos', {});
      game.enterHub();
      game.startDialogue('prologo');
      const d = game.dialogue;
      d.idx = 7; d.show(); clearInterval(d.timer); d.typing = false; d.hintEl.classList.add('hidden');
      T.hud(false); T.hideScreens();
      T.step(5);
    },
    frame: (f, n) => {
      T.step();
      const d = game.dialogue;
      d.textEl.textContent = d.full.slice(0, Math.floor(f * 2.6));
      const p = game.player, m = game.master;
      const dir = m.pos.clone().sub(p.pos).setY(0).normalize();
      const right = T.V(-dir.z, 0, dir.x);
      const k = f / (n - 1);
      T.cam(p.pos.clone().addScaledVector(dir, -1.4 + k * 0.4).addScaledVector(right, 0.75).add(T.V(0, 1.85, 0)), m.pos.clone().add(T.V(0, 1.45, 0)));
      T.overlay({ bars: 1 });
    },
  },
  {
    id: 'aparo', secs: 6.2,
    setup: () => {
      T.room('punhos', 0, 'combate');
      game.roomState.waves = [[{ t: 'carcereiro' }, { t: 'carcereiro' }, { t: 'carcereiro' }]];
      game.roomState.started = 0.01;
      T.hud(true);
      T.step(2);
      const p = game.player;
      game.enemies.forEach((e, i) => { e.pos.set(p.pos.x + (i - 1) * 2.4, 0, p.pos.z - 4.2 - i * 0.6); e.cooldown = 0.3 + i * 0.5; });
      T.step(15);
    },
    frame: (f, n) => {
      T.bot({ attackEvery: 9 });
      T.step();
      T.overlay({ cap: 'APARE', sub: 'no instante do golpe', capA: Math.min(1, f / 6) * Math.max(0, Math.min(1, (70 - f) / 10)), capColor: '#ff3a3a' });
    },
  },
  {
    id: 'esquiva', secs: 5.0,
    setup: () => {
      T.room('punhos', 0, 'duelo');
      game.roomState.waves = [[{ t: 'duelista' }, { t: 'duelista' }]];
      game.roomState.started = 0.01;
      T.hud(true);
      T.step(2);
      const p = game.player;
      game.enemies.forEach((e, i) => { e.pos.set(p.pos.x + (i ? 3 : -1), 0, p.pos.z - 7 - i * 2); e.cooldown = 99; });
      T.step(5);
    },
    frame: (f, n) => {
      const ds = game.enemies.filter(e => !e.dead);
      if (f === 6 && ds[0]) ds[0].startAttack(ds[0].def.attacks[1]); // investida (laranja)
      if (f === 70 && ds[1]) { ds[1].cooldown = 0; }
      if (f > 70) ds.forEach(e => { if (e.cooldown > 1) e.cooldown = 0.5; });
      T.bot({ attackEvery: 8 });
      T.step();
      T.overlay({ cap: 'ESQUIVE', sub: 'no último instante', capA: Math.min(1, f / 6) * Math.max(0, Math.min(1, (64 - f) / 10)), capColor: '#5ce1ff' });
    },
  },
  {
    id: 'mago', secs: 6.4,
    setup: () => {
      T.room('mago', 2, 'combate', T.allSkills('mago'));
      game.roomState.waves = [[{ t: 'carcereiro' }, { t: 'carcereiro' }, { t: 'atirador' }, { t: 'duelista' }, { t: 'carcereiro' }]];
      game.roomState.started = 0.01;
      T.hud(true);
      T.step(2);
      const p = game.player;
      game.enemies.forEach((e, i) => { e.pos.set(p.pos.x - 5 + i * 2.6, 0, p.pos.z - 9 - (i % 2) * 2); e.cooldown = 1 + i * 0.4; });
      T.step(8);
    },
    frame: (f, n) => {
      if (f === 70 || f === 150) game.input.pressed.add('KeyR');
      T.bot({ range: 9, attackEvery: 7, turn: 0.18 });
      T.step();
      T.overlay({ cap: 'MÃO ABERTA', sub: 'o caminho do mago', capA: Math.min(1, f / 6) * Math.max(0, Math.min(1, (66 - f) / 10)), capColor: '#9a7dff' });
    },
  },
  {
    id: 'tempestade', secs: 4.0,
    setup: () => {
      T.room('mago', 2, 'elite', T.allSkills('mago'));
      game.roomState.waves = [[{ t: 'carcereiro' }, { t: 'bruto', elite: true }, { t: 'carcereiro' }, { t: 'duelista' }, { t: 'carcereiro' }]];
      game.roomState.started = 0.01;
      T.hud(true);
      T.step(2);
      const p = game.player;
      game.enemies.forEach((e, i) => { const a = (i / 5) * Math.PI - Math.PI; e.pos.set(p.pos.x + Math.cos(a) * 6, 0, p.pos.z - 7 + Math.sin(a) * 2); });
      game.player.res = 100;
      T.step(10);
    },
    frame: (f, n) => {
      if (f === 8) game.input.pressed.add('KeyV');
      T.bot({ range: 9, attackEvery: 6, turn: 0.15 });
      T.step();
      T.overlay({ cap: 'TEMPESTADE DE ECOS', sub: 'golpe supremo', capA: Math.max(0, Math.min(1, (f - 10) / 6)) * Math.max(0, Math.min(1, (80 - f) / 10)), capColor: '#bfa8ff' });
    },
  },
  {
    id: 'punhos', secs: 6.0,
    setup: () => {
      T.room('punhos', 1, 'elite', T.allSkills('punhos'));
      game.roomState.waves = [[{ t: 'carcereiro' }, { t: 'carcereiro' }, { t: 'bruto' }, { t: 'carcereiro' }]];
      game.roomState.started = 0.01;
      T.hud(true);
      T.step(2);
      const p = game.player;
      game.enemies.forEach((e, i) => { e.pos.set(p.pos.x - 3 + i * 2, 0, p.pos.z - 9 - (i % 2)); e.cooldown = 2 + i * 0.3; });
      T.step(5);
    },
    frame: (f, n) => {
      if (f === 4) game.input.pressed.add('KeyR');
      if (f === 40) { game.player.res = 100; game.input.pressed.add('KeyV'); }
      T.bot({ attackEvery: 7 });
      T.step();
      T.overlay({ cap: 'PUNHO FECHADO', sub: 'o caminho dos punhos', capA: Math.min(1, f / 6) * Math.max(0, Math.min(1, (66 - f) / 10)), capColor: '#ffb27a' });
    },
  },
  {
    id: 'flechas', secs: 4.2,
    setup: () => {
      T.room('punhos', 1, 'flechas', {});
      game.roomState.waves = [[]];
      game.roomState.started = 0.01;
      T.hud(true);
      T.step(3);
      game.enemies.forEach(e => { e.cooldown = Math.random() * 0.6; });
      game.player.pos.set(0, 0, 4);
    },
    frame: (f, n) => {
      T.bot({ towers: true, turn: 0.12 });
      T.step();
      T.overlay({ cap: 'REFLITA', sub: 'devolva as flechas', capA: Math.min(1, f / 6) * Math.max(0, Math.min(1, (60 - f) / 10)), capColor: '#5ce1ff' });
    },
  },
  {
    id: 'chefe', secs: 7.0,
    setup: () => {
      T.room('punhos', 2, 'chefe', T.allSkills('punhos'));
      game.roomState.started = 0;
      game.spawnWave(game.roomState.waves[0]);
      const b = game.boss;
      b.hp = b.hpMax * 0.45; b.phase = 1;
      game.player.pos.set(0, 0, 4);
      b.pos.set(0, 0, -2);
      T.hud(true);
      T.step(20);
    },
    frame: (f, n) => {
      T.bot({ attackEvery: 8 });
      T.step();
      T.overlay({ cap: 'DERROTE O ARAUTO', sub: 'três andares · três fragmentos', capA: Math.min(1, f / 6) * Math.max(0, Math.min(1, (72 - f) / 10)), capColor: '#ff3030' });
    },
  },
  {
    id: 'arvore', secs: 3.2,
    setup: () => {
      T.clean();
      game.quitToMenu();
      const s = game.save;
      s.story.classe = 'mago'; s.ecos = 145;
      s.skills = { mago: { m_afiado: 3, m_perfura: 1, m_amplo: 2, m_espelho: 1, m_longo: 1 } };
      document.getElementById('btn-skills').click();
      T.hud(false);
      T.step(3);
    },
    frame: (f, n) => {
      T.step();
      T.overlay({ cap: 'EVOLUA', sub: 'duas árvores de habilidade', capA: Math.min(1, f / 6) * T.fade(f, n, 1, 8), capColor: '#e8c27a' });
    },
  },
  {
    id: 'fim', secs: 6.5,
    setup: () => {
      T.clean();
      game.quitToMenu();
      T.hideScreens();
      T.hud(false);
      T.step(3);
    },
    frame: (f, n) => {
      T.step();
      T.overlay({ end: Math.min(1, f / 18), bars: 0, black: Math.max(0, (f - (n - 20)) / 20) });
    },
  },
];

(async () => {
  fs.mkdirSync(path.join(OUT, 'frames'), { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', e => console.log('ERRO NA PÁGINA:', e.message));
  await page.goto('http://localhost:8123/');
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.reload();
  await page.waitForFunction(() => window.game && !document.getElementById('btn-start').disabled, null, { timeout: 60000 });
  await page.evaluate(PAGE_LIB);
  await page.evaluate(() => T.ready);
  await page.evaluate(() => { game.renderer.setAnimationLoop(null); game.input.locked = true; });

  let frame = 0;
  const shotsInfo = [];
  for (const shot of SHOTS) {
    if (onlyShots.length && !onlyShots.includes(shot.id)) continue;
    const n = Math.round(shot.secs * FPS);
    await page.evaluate(`T.frame = ${frame}; (${shot.setup})()`);
    shotsInfo.push({ id: shot.id, start: frame, frames: n });
    const t0 = Date.now();
    for (let f = 0; f < n; f++) {
      await page.evaluate(`T.frame = ${frame}; (${shot.frame})(${f}, ${n}); game.renderer.render(game.scene, game.camera);`);
      if (f % every === 0) await page.screenshot({ path: path.join(OUT, 'frames', String(frame).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 95 });
      frame++;
    }
    console.log(`${shot.id}: ${n} quadros em ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  const log = await page.evaluate(() => T.log);
  fs.writeFileSync(path.join(OUT, 'events.json'), JSON.stringify(log));
  fs.writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify({ fps: FPS, total: frame, shots: shotsInfo }, null, 1));
  await browser.close();
})();

import { Game } from './game.js';
import { initAudio } from './audio.js';
import { CLASSES, META_UPGRADES, writeSave } from './data.js';
import { preloadModels } from './models.js';
import { SKILL_TREES, ABILITY_INFO, nodeStatus, skillLevel, buySkill, resetSkills } from './skills.js';

const $ = (id) => document.getElementById(id);
const screens = ['menu', 'meta', 'help', 'choice', 'pause', 'end', 'skills'];
let skillsReturn = null;
let skillsTab = 'mago';
let metaReturn = null;
function show(id) { for (const s of screens) $(s).classList.toggle('hidden', s !== id); }
function hideAll() { for (const s of screens) $(s).classList.add('hidden'); }

let choiceHandler = null;
let choiceItems = [];

const ui = {
  showHUD(on) { $('hud').classList.toggle('hidden', !on); if (on) hideAll(); },
  prompt(t) {
    const el = $('prompt');
    el.classList.toggle('hidden', !t);
    if (t) el.textContent = t;
  },
  openSkills(classId, onClose) { skillsReturn = onClose; skillsTab = classId || 'mago'; renderSkills(); show('skills'); },
  openMeta(onClose) { metaReturn = onClose; renderMeta(); show('meta'); },
  weapon(t) { $('weapon-name').textContent = t; },
  roomName(t) { $('room-name').textContent = t; },
  objective(t) { if ($('objective').textContent !== t) $('objective').textContent = t; },
  boss(on, name) {
    $('boss-bar').classList.toggle('hidden', !on);
    if (name) $('boss-name').textContent = name;
  },
  boons(list) {
    const counts = {};
    for (const b of list) counts[b.name] = (counts[b.name] || 0) + 1;
    $('boon-list').innerHTML = Object.entries(counts).map(([n, c]) => `<div>${n}${c > 1 ? ' x' + c : ''}</div>`).join('');
  },
  showChoice(title, items, cb) {
    choiceHandler = cb; choiceItems = items;
    $('choice-title').textContent = title;
    const rar = ['', 'rare', 'epic'];
    const rarName = ['Comum', 'Rara', 'Épica'];
    $('choice-cards').innerHTML = items.map((b, i) => `
      <div class="card ${rar[b.rarity]}" data-i="${i}">
        <div class="t">${b.name}</div>
        <div class="d">${b.desc}</div>
        <div class="k">${rarName[b.rarity]} · tecla ${i + 1}</div>
      </div>`).join('');
    $('choice-cards').querySelectorAll('.card').forEach(el => el.addEventListener('click', () => pickChoice(+el.dataset.i)));
    show('choice');
  },
  pause(on, run) {
    if (on) {
      $('pause-boons').innerHTML = run && run.boons.length ? 'Bênçãos: ' + run.boons.map(b => b.name).join(', ') : 'Nenhuma bênção ainda.';
      show('pause');
    } else hideAll();
  },
  end(win, stats) {
    $('end-title').textContent = win ? 'Vitória! O Abismo silencia.' : 'Você caiu';
    $('end-title').style.color = win ? '#ffd34a' : '#ff5a6e';
    $('end-stats').innerHTML = Object.entries(stats).map(([k, v]) => `<div><span class="muted">${k}:</span> <b>${v}</b></div>`).join('');
    $('hud').classList.add('hidden');
    show('end');
  },
  hud(game) {
    const p = game.player, st = game.run.stats;
    drawTelegraphs(game);
    const hk = Math.max(0, p.hp / st.maxHp) * 100;
    $('hp-bar').style.width = hk + '%';
    $('hp-ghost').style.width = hk + '%';
    $('hp-text').textContent = `${Math.max(0, Math.ceil(p.hp))} / ${st.maxHp}`;
    const max = p.maxDash();
    const pips = $('dash-pips');
    if (pips.children.length !== max) pips.innerHTML = '<div class="pip"><div class="fill"></div></div>'.repeat(max);
    for (let i = 0; i < max; i++) {
      const el = pips.children[i];
      const full = i < p.dashCharges;
      el.classList.toggle('empty', !full);
      el.firstChild.style.width = (!full && i === p.dashCharges) ? (p.dashTimer / st.dashRecharge * 100) + '%' : '0%';
    }
    $('fury').textContent = st.fury && p.fury > 0 ? `FÚRIA x${p.fury} (+${p.fury * 10}% dano)` : (p.critNext ? 'PRÓXIMO GOLPE CRÍTICO' : '');
    $('ecos').textContent = '◈ ' + (game.run.isHub ? game.save.ecos : game.run.ecos);
    $('parry-ring').classList.toggle('on', p.isParrying());
    // Habilidades [R] e [V]
    const r = $('ab-r'), v = $('ab-v');
    r.classList.toggle('hidden', !st.abilityR);
    if (st.abilityR) {
      const info = ABILITY_INFO[st.abilityR];
      r.children[1].textContent = p.cdR > 0 ? `${info.name} ${p.cdR.toFixed(1)}s` : info.name;
      r.children[2].style.width = (p.cdR / info.cooldown * 100) + '%';
      r.classList.toggle('cooling', p.cdR > 0);
    }
    v.classList.toggle('hidden', !st.ultimate);
    if (st.ultimate) {
      v.children[1].textContent = `${ABILITY_INFO[st.ultimate].name} ${Math.floor(p.res)}%`;
      v.querySelector('.res-fill').style.width = p.res + '%';
      v.classList.toggle('ready', p.res >= 100);
    }
    if (game.boss && !game.boss.dead) {
      $('boss-hp-fill').style.width = (game.boss.hp / game.boss.hpMax * 100) + '%';
      $('boss-posture-fill').style.width = (game.boss.posture / game.boss.postureMax * 100) + '%';
    }
  },
};

// Aviso de ataque: anel que fecha até o instante do golpe (branco = aperte agora),
// "APARE" (vermelho) ou "ESQUIVE" (laranja); fora da tela vira seta na borda.
const teleCanvas = $('tele');
const teleCtx = teleCanvas.getContext('2d');
function drawTelegraphs(game) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = innerWidth, h = innerHeight;
  if (teleCanvas.width !== Math.round(w * dpr) || teleCanvas.height !== Math.round(h * dpr)) { teleCanvas.width = Math.round(w * dpr); teleCanvas.height = Math.round(h * dpr); }
  const g = teleCtx;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const cam = game.camera;
  for (const e of game.enemies) {
    if (e.dead || !e.atk || (e.state !== 'windup' && e.state !== 'active')) continue;
    if (e.pos.distanceTo(game.player.pos) > 30) continue;
    const remain = e.state === 'active' ? 0 : e.atk.windupTime - e.t;
    const now = remain < 0.14;
    const col = e.atk.unparryable ? '#ff8a00' : '#ff2a2a';
    const top = e.pos.clone(); top.y = e.baseY + e.def.height * (e.elite ? 1.15 : 1) + 0.3;
    const local = top.clone().applyMatrix4(cam.matrixWorldInverse);
    const v = top.clone().project(cam);
    const sx = (v.x + 1) / 2 * w, sy = (1 - v.y) / 2 * h;
    const inside = local.z < 0 && sx > 20 && sx < w - 20 && sy > 20 && sy < h - 20;
    g.save();
    g.shadowColor = col; g.shadowBlur = 12;
    if (inside) {
      const r = 16 + 46 * Math.min(1, remain / 0.9);
      g.lineWidth = now ? 5 : 3; g.strokeStyle = now ? '#fff' : col;
      g.beginPath(); g.arc(sx, sy, r, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 3; g.strokeStyle = col;
      g.beginPath(); g.arc(sx, sy, 14, 0, Math.PI * 2); g.stroke();
      g.fillStyle = now ? '#fff' : col; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `900 ${now ? 26 : 20}px Segoe UI, sans-serif`; g.fillText('!', sx, sy + 1);
      g.font = '800 13px Segoe UI, sans-serif'; g.fillStyle = col;
      g.fillText(e.atk.unparryable ? 'ESQUIVE' : 'APARE', sx, sy - r - 12);
    } else {
      let dx = local.x, dy = -local.y;
      if (local.z > 0 && Math.hypot(dx, dy) < 0.5) dy = 1;
      const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
      const ex = w / 2 + dx * (Math.min(w, h) / 2 - 40), ey = h / 2 + dy * (Math.min(w, h) / 2 - 40);
      g.translate(ex, ey); g.rotate(Math.atan2(dy, dx));
      g.fillStyle = now ? '#fff' : col;
      g.beginPath(); g.moveTo(16, 0); g.lineTo(-10, -12); g.lineTo(-10, 12); g.closePath(); g.fill();
    }
    g.restore();
  }
}

function pickChoice(i) {
  if (!choiceHandler || !choiceItems[i]) return;
  const cb = choiceHandler; choiceHandler = null;
  hideAll();
  cb(choiceItems[i]);
}

const game = new Game($('game'), ui);
window.game = game; // útil para depuração

function renderMenu() {
  const save = game.save;
  const cls = save.story.classe ? CLASSES[save.story.classe] : null;
  $('menu-path').textContent = cls ? `Caminho atual: ${cls.path} (${cls.name})` : 'Um novo aprendiz chega ao Mosteiro do Eco.';
  $('meta-ecos').textContent = `◈ ${save.ecos} Ecos · Expedições: ${save.runs} · Vitórias: ${save.wins}`;
}

function renderSkills() {
  const save = game.save;
  const tree = SKILL_TREES[skillsTab];
  $('skills-tabs').innerHTML = Object.entries(SKILL_TREES).map(([id, t]) =>
    `<button class="tab ${id === skillsTab ? 'sel' : ''}" data-tab="${id}">${t.name}${save.story.classe === id ? ' (atual)' : ''}</button>`).join('');
  $('skills-tabs').querySelectorAll('button').forEach(b => b.onclick = () => { skillsTab = b.dataset.tab; resetArmed = false; renderSkills(); });
  $('skills-ecos').textContent = `Você tem ◈ ${save.ecos} Ecos`;
  const labels = { max: 'Aprendida', disponivel: 'Clique para aprender', caro: 'Ecos insuficientes', bloqueado: 'Aprenda a anterior' };
  $('skills-tree').innerHTML = tree.branches.map(b => `
    <div class="branch">
      <h3>${b.name}</h3><p class="bd">${b.desc}</p>
      ${b.nodes.map(n => {
        const st = nodeStatus(save, skillsTab, n.id);
        const lvl = skillLevel(save, skillsTab, n.id);
        const max = n.cost.length;
        const cost = lvl < max ? `◈ ${n.cost[lvl]} · ` : '';
        return `<div class="node ${st} ${lvl > 0 && lvl < max ? 'parcial' : ''}" data-n="${n.id}" tabindex="0">
          ${n.tag ? `<span class="tag">${n.tag === 'passiva' ? 'PASSIVA' : '[' + n.tag + ']'}</span>` : ''}
          <div class="t"><span>${n.name}</span><span>${max > 1 ? '●'.repeat(lvl) + '○'.repeat(max - lvl) : (lvl ? '●' : '○')}</span></div>
          <div class="d">${n.desc}</div>
          <div class="k">${cost}${labels[st]}</div>
        </div>`;
      }).join('')}
    </div>`).join('');
  $('skills-tree').querySelectorAll('.node').forEach(el => el.onclick = () => {
    if (buySkill(save, skillsTab, el.dataset.n)) { writeSave(save); renderSkills(); }
  });
  $('btn-skills-reset').textContent = resetArmed ? 'Confirmar: devolver todos os Ecos deste caminho' : 'Redistribuir pontos';
}
let resetArmed = false;

function renderMeta() {
  const save = game.save;
  $('meta-list').innerHTML = META_UPGRADES.map(u => {
    const lvl = save.meta[u.id] || 0;
    const maxed = lvl >= u.max;
    const cost = u.cost(lvl);
    return `<div class="card ${maxed ? 'sel' : ''}" data-u="${u.id}">
      <div class="t">${u.name} ${'●'.repeat(lvl)}${'○'.repeat(u.max - lvl)}</div>
      <div class="d">${u.desc}</div>
      <div class="k">${maxed ? 'Máximo' : `Custo ◈ ${cost}${save.ecos < cost ? ' (insuficiente)' : ''}`}</div>
    </div>`;
  }).join('') + `<p class="muted" style="width:100%;text-align:center">Você tem ◈ ${save.ecos}</p>`;
  $('meta-list').querySelectorAll('.card').forEach(el => el.addEventListener('click', () => {
    const u = META_UPGRADES.find(x => x.id === el.dataset.u);
    const lvl = save.meta[u.id] || 0;
    if (lvl >= u.max || save.ecos < u.cost(lvl)) return;
    save.ecos -= u.cost(lvl);
    save.meta[u.id] = lvl + 1;
    writeSave(save);
    renderMeta();
  }));
}

function toMenu() {
  game.quitToMenu();
  renderMenu();
  show('menu');
}

$('btn-start').onclick = () => { initAudio(); hideAll(); game.enterHub(); };
$('btn-meta').onclick = () => { metaReturn = null; renderMeta(); show('meta'); };
$('btn-meta-back').onclick = () => {
  if (metaReturn) { const cb = metaReturn; metaReturn = null; hideAll(); cb(); return; }
  renderMenu(); show('menu');
};
$('btn-help').onclick = () => show('help');
$('btn-skills').onclick = () => { skillsReturn = null; skillsTab = game.save.story.classe || 'mago'; resetArmed = false; renderSkills(); show('skills'); };
$('btn-skills-back').onclick = () => {
  resetArmed = false;
  if (skillsReturn) { const cb = skillsReturn; skillsReturn = null; hideAll(); cb(); return; }
  renderMenu(); show('menu');
};
$('btn-skills-reset').onclick = () => {
  if (!resetArmed) { resetArmed = true; renderSkills(); return; }
  resetArmed = false;
  resetSkills(game.save, skillsTab);
  writeSave(game.save);
  renderSkills();
};
$('btn-help-back').onclick = () => show('menu');
$('btn-resume').onclick = () => game.resume();
$('btn-quit').onclick = () => { if (game.run && game.run.isHub) toMenu(); else if (game.run) game.endRun(false); };
$('btn-end').onclick = () => { hideAll(); game.enterHub(game.save.story.last); };
$('btn-end-menu').onclick = toMenu;
$('sens').oninput = (e) => { game.input.sensitivity = +e.target.value; };

addEventListener('keydown', (e) => {
  if (game.state === 'choice' && ['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(e.code)) pickChoice(+e.code.slice(-1) - 1);
});

// Clicar no jogo recupera o pointer lock se ele se perder fora da pausa
$('game').addEventListener('click', () => { if (game.state === 'playing' && !game.input.locked) game.input.lock(); });

renderMenu();
show('menu');

// Carrega os .glb listados em MODEL_MANIFEST (se houver) antes de liberar o jogo.
$('btn-start').disabled = true;
$('loading').classList.remove('hidden');
preloadModels((k, key) => { $('loading').textContent = `Carregando modelos… ${Math.round(k * 100)}% (${key})`; })
  .finally(() => { $('btn-start').disabled = false; $('loading').classList.add('hidden'); game.showMenuHero(); });

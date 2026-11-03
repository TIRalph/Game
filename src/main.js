import { Game } from './game.js';
import { initAudio } from './audio.js';
import { WEAPONS, META_UPGRADES, writeSave } from './data.js';

const $ = (id) => document.getElementById(id);
const screens = ['menu', 'meta', 'help', 'choice', 'pause', 'end'];
function show(id) { for (const s of screens) $(s).classList.toggle('hidden', s !== id); }
function hideAll() { for (const s of screens) $(s).classList.add('hidden'); }

let choiceHandler = null;
let choiceItems = [];
let selectedWeapon = 'espada';

const ui = {
  showHUD(on) { $('hud').classList.toggle('hidden', !on); if (on) hideAll(); },
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
    $('ecos').textContent = '◈ ' + game.run.ecos;
    $('parry-ring').classList.toggle('on', p.isParrying());
    if (game.boss && !game.boss.dead) {
      $('boss-hp-fill').style.width = (game.boss.hp / game.boss.hpMax * 100) + '%';
      $('boss-posture-fill').style.width = (game.boss.posture / game.boss.postureMax * 100) + '%';
    }
  },
};

function pickChoice(i) {
  if (!choiceHandler || !choiceItems[i]) return;
  const cb = choiceHandler; choiceHandler = null;
  hideAll();
  cb(choiceItems[i]);
}

const game = new Game($('game'), ui);
window.game = game; // útil para depuração

function renderWeapons() {
  const save = game.save;
  $('weapon-select').innerHTML = Object.values(WEAPONS).map(w => {
    const locked = !save.unlocked[w.id];
    return `<div class="card ${locked ? 'locked' : ''} ${selectedWeapon === w.id ? 'sel' : ''}" data-w="${w.id}">
      <div class="t">${w.name}</div>
      <div class="d">${w.desc}</div>
      <div class="k">${locked ? `Bloqueada · desbloquear por ◈ ${w.unlock}` : `Dano ${w.damage} · aparo ${Math.round(w.parryWindow * 1000)}ms`}</div>
    </div>`;
  }).join('');
  $('weapon-select').querySelectorAll('.card').forEach(el => el.addEventListener('click', () => {
    const id = el.dataset.w, w = WEAPONS[id];
    if (!save.unlocked[id]) {
      if (save.ecos >= w.unlock) { save.ecos -= w.unlock; save.unlocked[id] = true; writeSave(save); }
      else return;
    }
    selectedWeapon = id;
    renderWeapons();
  }));
  $('meta-ecos').textContent = `◈ ${save.ecos} Ecos · Runs: ${save.runs} · Vitórias: ${save.wins}`;
}

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
  renderWeapons();
  show('menu');
}

$('btn-start').onclick = () => { initAudio(); hideAll(); game.startRun(selectedWeapon); };
$('btn-meta').onclick = () => { renderMeta(); show('meta'); };
$('btn-meta-back').onclick = () => { renderWeapons(); show('menu'); };
$('btn-help').onclick = () => show('help');
$('btn-help-back').onclick = () => show('menu');
$('btn-resume').onclick = () => game.resume();
$('btn-quit').onclick = () => { if (game.run) game.endRun(false); };
$('btn-end').onclick = toMenu;
$('sens').oninput = (e) => { game.input.sensitivity = +e.target.value; };

addEventListener('keydown', (e) => {
  if (game.state === 'choice' && ['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(e.code)) pickChoice(+e.code.slice(-1) - 1);
});

// Clicar no jogo recupera o pointer lock se ele se perder fora da pausa
$('game').addEventListener('click', () => { if (game.state === 'playing' && !game.input.locked) game.input.lock(); });

renderWeapons();
show('menu');

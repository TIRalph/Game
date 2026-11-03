// Armas, bênçãos (upgrades da run) e melhorias permanentes.

export const WEAPONS = {
  espada: {
    id: 'espada', name: 'Espada', desc: 'Equilibrada. Janela de aparo generosa.',
    damage: 20, swingTime: 0.42, activeAt: 0.35, range: 2.8, arc: 0.45,
    parryWindow: 0.2, postureMult: 1, comboMults: [1, 1, 1.6], dashBonus: 0,
    color: 0xcfd6ff, unlock: 0,
  },
  adagas: {
    id: 'adagas', name: 'Adagas Gêmeas', desc: 'Golpes rápidos. +1 esquiva. Esquiva perfeita dá crítico x3.',
    damage: 10, swingTime: 0.22, activeAt: 0.4, range: 2.3, arc: 0.5,
    parryWindow: 0.15, postureMult: 0.7, comboMults: [1, 1, 1.3], dashBonus: 1, perfectDodgeCrit: 3,
    color: 0x9affd0, unlock: 60,
  },
  martelo: {
    id: 'martelo', name: 'Martelo', desc: 'Lento e devastador. Dano de postura x2. 3º golpe gera onda de choque.',
    damage: 40, swingTime: 0.78, activeAt: 0.45, range: 3.1, arc: 0.35,
    parryWindow: 0.24, postureMult: 2, comboMults: [1, 1.1, 1.8], dashBonus: 0, slamFinisher: true,
    color: 0xffb27a, unlock: 120,
  },
};

export function baseStats(meta) {
  return {
    maxHp: 100 + (meta.hp || 0) * 15,
    dmgMult: 1 + (meta.dmg || 0) * 0.08,
    attackSpeed: 1,
    parryWindowMult: 1 + (meta.parry || 0) * 0.1,
    dashCharges: 2,
    dashRecharge: 1.1,
    slowmo: 0.7,
    riposteMult: 2,
    parryHeal: 0,
    parryShockwave: 0,
    dodgeExplosion: 0,
    reflectMult: 3,
    reflectHoming: false,
    fury: false,
    slashWave: false,
    executeMult: 3,
    revives: meta.revive ? 1 : 0,
    ecoMult: 1,
    postureMult: 1,
    killHeal: 0,
    thorns: 0,
    moveSpeed: 1,
  };
}

// rarity: 0 comum, 1 raro, 2 épico
export const BOONS = [
  { id: 'afiada', name: 'Lâmina Afiada', desc: '+20% de dano.', rarity: 0, stack: true, apply: s => { s.dmgMult += 0.2; } },
  { id: 'veloz', name: 'Golpe Veloz', desc: '+18% velocidade de ataque.', rarity: 0, stack: true, apply: s => { s.attackSpeed += 0.18; } },
  { id: 'pedra', name: 'Pele de Pedra', desc: '+30 de vida máxima e cura 30.', rarity: 0, stack: true, apply: (s, p) => { s.maxHp += 30; p && p.heal(30); } },
  { id: 'janela', name: 'Olho Atento', desc: 'Janela de aparo +30%.', rarity: 0, stack: true, apply: s => { s.parryWindowMult += 0.3; } },
  { id: 'fantasma', name: 'Passo Fantasma', desc: '+1 carga de esquiva.', rarity: 1, stack: true, apply: s => { s.dashCharges += 1; } },
  { id: 'recarga', name: 'Fôlego', desc: 'Esquivas recarregam 30% mais rápido.', rarity: 0, stack: true, apply: s => { s.dashRecharge *= 0.7; } },
  { id: 'contra', name: 'Contra-Ataque', desc: 'Golpes em inimigos atordoados por aparo: +100% de dano.', rarity: 1, stack: true, apply: s => { s.riposteMult += 1; } },
  { id: 'vampiro', name: 'Aparo Vampírico', desc: 'Cada aparo perfeito cura 5.', rarity: 0, stack: true, apply: s => { s.parryHeal += 5; } },
  { id: 'choque', name: 'Eco de Choque', desc: 'Aparos liberam uma onda que causa 25 de dano ao redor.', rarity: 1, stack: true, apply: s => { s.parryShockwave += 25; } },
  { id: 'explosiva', name: 'Esquiva Explosiva', desc: 'Esquivas perfeitas explodem causando 35 de dano.', rarity: 1, stack: true, apply: s => { s.dodgeExplosion += 35; } },
  { id: 'tempo', name: 'Dilatação', desc: 'Câmera lenta da esquiva perfeita dura +50%.', rarity: 0, stack: true, apply: s => { s.slowmo *= 1.5; } },
  { id: 'teleguiado', name: 'Reflexo Teleguiado', desc: 'Projéteis refletidos perseguem inimigos e causam +100% de dano.', rarity: 1, stack: false, apply: s => { s.reflectHoming = true; s.reflectMult += 3; } },
  { id: 'furia', name: 'Fúria Rítmica', desc: 'Cada ação perfeita dá +10% de dano (até 6x). Perde ao ser atingido.', rarity: 2, stack: false, apply: s => { s.fury = true; } },
  { id: 'onda', name: 'Lâmina Projetada', desc: 'O golpe final do combo dispara uma onda cortante.', rarity: 2, stack: false, apply: s => { s.slashWave = true; } },
  { id: 'execucao', name: 'Executor', desc: 'Inimigos quebrados recebem dano x4 (em vez de x3).', rarity: 1, stack: false, apply: s => { s.executeMult = 4; } },
  { id: 'fenix', name: 'Pena de Fênix', desc: 'Reviva uma vez com 50% de vida.', rarity: 2, stack: true, apply: s => { s.revives += 1; } },
  { id: 'ima', name: 'Ímã de Ecos', desc: '+50% de Ecos ganhos.', rarity: 0, stack: true, apply: s => { s.ecoMult += 0.5; } },
  { id: 'quebra', name: 'Quebra-Postura', desc: '+50% de dano de postura.', rarity: 0, stack: true, apply: s => { s.postureMult += 0.5; } },
  { id: 'colheita', name: 'Colheita', desc: 'Abates curam 4 de vida.', rarity: 0, stack: true, apply: s => { s.killHeal += 4; } },
  { id: 'espinhos', name: 'Espinhos', desc: 'Quem te atinge sofre 20 de dano.', rarity: 0, stack: true, apply: s => { s.thorns += 20; } },
  { id: 'agil', name: 'Pés Leves', desc: '+15% velocidade de movimento.', rarity: 0, stack: true, apply: s => { s.moveSpeed += 0.15; } },
];

export const META_UPGRADES = [
  { id: 'hp', name: 'Vitalidade', desc: '+15 de vida máxima inicial.', max: 5, cost: l => 20 + l * 20 },
  { id: 'dmg', name: 'Fio Ancestral', desc: '+8% de dano base.', max: 5, cost: l => 25 + l * 25 },
  { id: 'parry', name: 'Reflexos', desc: '+10% janela de aparo.', max: 3, cost: l => 30 + l * 30 },
  { id: 'choice', name: 'Destino Amplo', desc: 'Bênçãos oferecem 4 opções.', max: 1, cost: () => 80 },
  { id: 'revive', name: 'Segundo Fôlego', desc: 'Comece cada run com 1 revive.', max: 1, cost: () => 150 },
];

const SAVE_KEY = 'eco-da-lamina-save-v1';
export function loadSave() {
  const def = { ecos: 0, meta: {}, unlocked: { espada: true }, runs: 0, wins: 0, best: 0 };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return Object.assign(def, JSON.parse(raw));
  } catch { /* sem storage */ }
  return def;
}
export function writeSave(save) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* sem storage */ }
}

export const ROOM_TYPES = {
  combate: { name: 'Combate', color: 0xb0b0ff, reward: 'boon', desc: 'Derrote todos' },
  elite: { name: 'Elite', color: 0xff7af5, reward: 'boon+', desc: 'Inimigos fortes · bênção rara' },
  sobrevivencia: { name: 'Sobrevivência', color: 0xffd34a, reward: 'boon', desc: 'Aguente o tempo' },
  duelo: { name: 'Duelo', color: 0xff5a6e, reward: 'boon+', desc: 'Só aparos causam dano' },
  flechas: { name: 'Chuva de Flechas', color: 0x5ce1ff, reward: 'boon', desc: 'Reflita para vencer' },
  santuario: { name: 'Santuário', color: 0x9affd0, reward: 'heal', desc: 'Descanso + bênção' },
  chefe: { name: 'Chefe', color: 0xff3030, reward: 'boss', desc: 'Guardião do andar' },
};

export const FLOORS = [
  { name: 'Cripta Esquecida', fog: 0x120f1c, floor: 0x2a2638, wall: 0x3a3450, accent: 0x7a6cff, light: 0x9a8cff },
  { name: 'Forja Rubra', fog: 0x1c0d0a, floor: 0x382420, wall: 0x4a2c24, accent: 0xff6a2a, light: 0xffa070 },
  { name: 'Abismo Glacial', fog: 0x0a141c, floor: 0x1e2c38, wall: 0x2a4050, accent: 0x5ce1ff, light: 0x9ae8ff },
];

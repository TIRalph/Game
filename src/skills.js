/*
 * ÁRVORES DE HABILIDADE
 * ---------------------
 * Cada caminho tem 3 ramos. Os nós de um ramo são comprados em ordem com Ecos
 * (o nó seguinte exige o anterior). As compras ficam salvas por caminho em save.skills.
 * `apply(stats, nível)` altera os atributos da run; o jogo lê as flags em game.js.
 *
 * Técnicas especiais:
 *   [R] habilidade ativa com recarga (stats.abilityR)
 *   [V] golpe supremo, gasta a Ressonância cheia (stats.ultimate)
 * A Ressonância enche com aparos, esquivas perfeitas e golpes que acertam.
 */

export const SKILL_TREES = {
  mago: {
    name: 'Mão Aberta',
    branches: [
      {
        id: 'arcano', name: 'Arcano', desc: 'Força dos dardos',
        nodes: [
          { id: 'm_afiado', name: 'Dardos Afiados', desc: '+12% de dano por nível.', cost: [15, 25, 40], apply: (s, l) => { s.dmgMult += 0.12 * l; } },
          { id: 'm_perfura', name: 'Dardo Perfurante', desc: 'Dardos atravessam 1 inimigo.', cost: [35], apply: (s) => { s.pierce += 1; } },
          { id: 'm_orbe', name: 'Orbe Instável', desc: 'A explosão do 3º dardo fica 50% maior e quebra mais postura.', cost: [50], apply: (s) => { s.orbMult = 1.5; } },
          { id: 'm_raio', name: 'Cadeia de Raios', tag: 'R', desc: 'Um raio salta entre até 4 inimigos. Recarga de 6 s.', cost: [80], apply: (s) => { s.abilityR = 'raio'; } },
        ],
      },
      {
        id: 'selo', name: 'Selo', desc: 'Aparo e reflexo',
        nodes: [
          { id: 'm_amplo', name: 'Selo Amplo', desc: 'Janela de aparo +15% por nível.', cost: [20, 35], apply: (s, l) => { s.parryWindowMult += 0.15 * l; } },
          { id: 'm_espelho', name: 'Espelho Rúnico', desc: 'Projéteis refletidos causam +150% de dano e voam 30% mais rápido.', cost: [35], apply: (s) => { s.reflectMult += 1.5; s.reflectSpeed *= 1.3; } },
          { id: 'm_explosivo', name: 'Selo Explosivo', desc: 'Cada aparo libera uma onda de 18 de dano ao redor.', cost: [50], apply: (s) => { s.parryShockwave += 18; } },
          { id: 'm_tempestade', name: 'Tempestade de Ecos', tag: 'V', desc: 'Golpe supremo: 3 s de raios caindo sobre todos os inimigos próximos.', cost: [90], apply: (s) => { s.ultimate = 'tempestade'; } },
        ],
      },
      {
        id: 'fluxo', name: 'Fluxo', desc: 'Lampejo e tempo',
        nodes: [
          { id: 'm_longo', name: 'Lampejo Longo', desc: 'Esquiva 25% mais longa.', cost: [15], apply: (s) => { s.dodgeDistMult *= 1.25; } },
          { id: 'm_carga', name: 'Carga Extra', desc: '+1 carga de esquiva.', cost: [35], apply: (s) => { s.dashCharges += 1; } },
          { id: 'm_rastro', name: 'Rastro Arcano', desc: 'Cada esquiva deixa uma runa que explode (25 de dano).', cost: [45], apply: (s) => { s.dodgeMine += 25; } },
          { id: 'm_temporal', name: 'Eco Temporal', tag: 'passiva', desc: 'Câmera lenta 50% mais longa e todo dardo nela é crítico.', cost: [80], apply: (s) => { s.slowmo *= 1.5; s.ecoTemporal = true; } },
        ],
      },
    ],
  },
  punhos: {
    name: 'Punho Fechado',
    branches: [
      {
        id: 'punho', name: 'Punho', desc: 'Força dos golpes',
        nodes: [
          { id: 'p_ferro', name: 'Nós de Ferro', desc: '+12% de dano por nível.', cost: [15, 25, 40], apply: (s, l) => { s.dmgMult += 0.12 * l; } },
          { id: 'p_ritmo', name: 'Ritmo', desc: '+15% de velocidade de ataque.', cost: [35], apply: (s) => { s.attackSpeed += 0.15; } },
          { id: 'p_terremoto', name: 'Terremoto', desc: 'O 3º golpe abala uma área 50% maior e quebra mais postura.', cost: [50], apply: (s) => { s.quakeMult = 1.5; } },
          { id: 'p_dragao', name: 'Investida do Dragão', tag: 'R', desc: 'Avança atravessando inimigos, invulnerável (35 de dano). Recarga de 5 s.', cost: [80], apply: (s) => { s.abilityR = 'dragao'; } },
        ],
      },
      {
        id: 'guarda', name: 'Guarda', desc: 'Aparo e contra-ataque',
        nodes: [
          { id: 'p_firme', name: 'Guarda Firme', desc: 'Janela de aparo +15% por nível.', cost: [20, 35], apply: (s, l) => { s.parryWindowMult += 0.15 * l; } },
          { id: 'p_contra', name: 'Contragolpe', desc: 'O primeiro golpe até 1,2 s depois de um aparo causa dano dobrado e cura 4.', cost: [35], apply: (s) => { s.counterHit = true; } },
          { id: 'p_ossos', name: 'Quebra-Ossos', desc: '+50% de dano de postura.', cost: [50], apply: (s) => { s.postureMult += 0.5; } },
          { id: 'p_cem', name: 'Cem Punhos', tag: 'V', desc: 'Golpe supremo: 2 s de socos em sequência à frente, invulnerável.', cost: [90], apply: (s) => { s.ultimate = 'cem'; } },
        ],
      },
      {
        id: 'passo', name: 'Passo', desc: 'Movimento e resistência',
        nodes: [
          { id: 'p_leve', name: 'Passo Leve', desc: '+10% de velocidade de movimento.', cost: [15], apply: (s) => { s.moveSpeed += 0.1; } },
          { id: 'p_dupla', name: 'Esquiva Dupla', desc: '+1 carga de esquiva.', cost: [35], apply: (s) => { s.dashCharges += 1; } },
          { id: 'p_contraesq', name: 'Contra-Esquiva', desc: 'Esquiva perfeita acerta o inimigo mais próximo (30 de dano e postura).', cost: [45], apply: (s) => { s.contraEsquiva = true; } },
          { id: 'p_pedra', name: 'Corpo de Pedra', tag: 'passiva', desc: '+40 de vida máxima e 15% menos dano recebido.', cost: [80], apply: (s) => { s.maxHp += 40; s.damageTaken *= 0.85; } },
        ],
      },
    ],
  },
};

export const ABILITY_INFO = {
  raio: { name: 'Cadeia de Raios', cooldown: 6 },
  dragao: { name: 'Investida do Dragão', cooldown: 5 },
  tempestade: { name: 'Tempestade de Ecos' },
  cem: { name: 'Cem Punhos' },
};

export function findNode(classId, nodeId) {
  for (const b of SKILL_TREES[classId].branches) {
    const i = b.nodes.findIndex(n => n.id === nodeId);
    if (i >= 0) return { branch: b, node: b.nodes[i], index: i };
  }
  return null;
}

export function skillLevel(save, classId, nodeId) {
  return (save.skills && save.skills[classId] && save.skills[classId][nodeId]) || 0;
}

// Situação de um nó: 'max' | 'disponivel' | 'caro' | 'bloqueado'
export function nodeStatus(save, classId, nodeId) {
  const f = findNode(classId, nodeId);
  const lvl = skillLevel(save, classId, nodeId);
  if (lvl >= f.node.cost.length) return 'max';
  if (f.index > 0 && skillLevel(save, classId, f.branch.nodes[f.index - 1].id) === 0) return 'bloqueado';
  return save.ecos >= f.node.cost[lvl] ? 'disponivel' : 'caro';
}

export function buySkill(save, classId, nodeId) {
  if (nodeStatus(save, classId, nodeId) !== 'disponivel') return false;
  const { node } = findNode(classId, nodeId);
  const lvl = skillLevel(save, classId, nodeId);
  save.ecos -= node.cost[lvl];
  save.skills = save.skills || {};
  save.skills[classId] = save.skills[classId] || {};
  save.skills[classId][nodeId] = lvl + 1;
  return true;
}

// Devolve todos os Ecos gastos na árvore de um caminho.
export function resetSkills(save, classId) {
  const mine = (save.skills && save.skills[classId]) || {};
  let refund = 0;
  for (const [id, lvl] of Object.entries(mine)) {
    const f = findNode(classId, id);
    if (f) for (let i = 0; i < lvl; i++) refund += f.node.cost[i];
  }
  save.ecos += refund;
  if (save.skills) save.skills[classId] = {};
  return refund;
}

export function applySkills(stats, save, classId) {
  if (!classId) return stats;
  const mine = (save.skills && save.skills[classId]) || {};
  for (const b of SKILL_TREES[classId].branches) {
    for (const n of b.nodes) {
      const lvl = mine[n.id] || 0;
      if (lvl > 0) n.apply(stats, lvl);
    }
  }
  return stats;
}

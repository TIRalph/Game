/*
 * LORE E DIÁLOGOS
 * ---------------
 * Cada diálogo é uma lista de falas: { s: quemFala, t: 'texto' }.
 * Uma fala pode ter `choices`: [{ t: 'texto do botão', action: 'id', next: 'outroDialogo' }].
 *   - action é tratada pelo jogo (ver Game.dialogueAction): 'classe:mago', 'classe:punhos', 'meta', 'descer'.
 *   - next continua em outro diálogo depois da escolha.
 * Texto aceita variáveis entre chaves: {caminho}, {classe}, {mortes}.
 * Para adicionar história nova, crie uma entrada aqui e chame game.startDialogue('id').
 */

export const SPEAKERS = {
  narrador: { name: '', color: '#b9b4cc' },
  mestre: { name: 'Mestre Rafael', color: '#e8c27a' },
  aprendiz: { name: 'Você', color: '#9ad0ff' },
  arauto: { name: 'O Arauto', color: '#ff5a6e' },
  eco: { name: 'Eco de Rafael', color: '#e8c27a' },
};

export const LORE = {
  mundo: 'O Sino do Eco guardava a memória do mundo: cada voz, cada passo, cada vida ressoava nele. Quando o Arauto o partiu em três, o mundo começou a esquecer.',
  mosteiro: 'O Mosteiro do Eco fica no alto dos mil degraus. Ali vive Rafael, último guardião do Sino.',
  eco: 'Nas Profundezas, quem cai não morre: vira eco e volta ao pé do Sino, lembrando do que aprendeu.',
  caminhos: {
    mago: 'A Mão Aberta molda o eco em magia: dardos arcanos e selos rúnicos.',
    punhos: 'O Punho Fechado molda o eco no próprio corpo: golpes, guarda e passos rápidos.',
  },
};

export const DIALOGUES = {
  prologo: [
    { s: 'narrador', t: 'Há muito tempo, o Sino do Eco guardava a memória do mundo. Cada voz, cada passo, cada vida ressoava nele.' },
    { s: 'narrador', t: 'Então o Arauto desceu das montanhas e partiu o Sino em três. Desde aquele dia, o mundo esquece.' },
    { s: 'narrador', t: 'Você subiu os mil degraus do Mosteiro do Eco atrás da única pessoa que ainda se lembra.' },
    { s: 'mestre', t: 'Então você veio. Achei que o silêncio já tivesse levado o último aprendiz.' },
    { s: 'mestre', t: 'Sou Rafael. Fui guardião do Sino antes que ele se calasse.' },
    { s: 'aprendiz', t: 'Disseram que o senhor sabe como fazê-lo soar de novo.' },
    { s: 'mestre', t: 'Os fragmentos caíram nas Profundezas: a Cripta Esquecida, a Forja Rubra e o Abismo Glacial. O Arauto guarda cada um deles.' },
    { s: 'mestre', t: 'Lá embaixo, quem cai não morre. Vira eco e volta para cá, ao pé do Sino. Lembra do que aprendeu e esquece o resto.' },
    { s: 'mestre', t: 'Por isso cair não é o fim. Desistir é.' },
    { s: 'mestre', t: 'Antes de descer, escolha como vai lutar. O Mosteiro ensina dois caminhos, e os dois começam nas mãos.' },
    { s: 'mestre', t: 'A Mão Aberta molda o eco em magia: dardos arcanos e selos que devolvem os golpes. Você enxerga o mundo pelos próprios olhos.' },
    { s: 'mestre', t: 'O Punho Fechado molda o eco no próprio corpo: socos, guarda e passos rápidos. Você aprende a se ver de fora, como o inimigo te vê.' },
    { s: 'mestre', t: 'Qual caminho é o seu?', choices: [
      { t: 'Mão Aberta — Mago (primeira pessoa)', action: 'classe:mago', next: 'escolha_mago' },
      { t: 'Punho Fechado — Punhos (terceira pessoa)', action: 'classe:punhos', next: 'escolha_punhos' },
    ] },
  ],
  escolha_mago: [
    { s: 'mestre', t: 'A Mão Aberta. Palmas firmes, olhar mais firme ainda.' },
    { s: 'mestre', t: 'Clique para lançar dardos. O terceiro dardo do ritmo é mais pesado. Com o botão direito você ergue um selo: na hora certa, ele devolve o golpe.' },
    { next: 'licao' },
  ],
  escolha_punhos: [
    { s: 'mestre', t: 'O Punho Fechado. Bom. Os punhos não mentem.' },
    { s: 'mestre', t: 'Três golpes formam o ritmo, e o terceiro abala o chão. Com o botão direito você ergue a guarda: na hora certa, ela quebra o ataque do outro.' },
    { next: 'licao' },
  ],
  licao: [
    { s: 'mestre', t: 'A última lição vale para os dois caminhos: o golpe que brilha vermelho pode ser aparado. O que brilha laranja, só se evita.' },
    { s: 'mestre', t: 'Escute o tempo, não a força. Desvie no último instante e o mundo desacelera para você.' },
    { s: 'mestre', t: 'Cada caminho guarda técnicas que eu posso te ensinar. Traga Ecos das Profundezas e venha treinar comigo.' },
    { s: 'mestre', t: 'Aquele boneco de treino ataca devagar. Pratique nele. Quando estiver pronto, o portal ao norte leva às Profundezas.' },
  ],

  // Conversa no mosteiro entre expedições
  mestre_menu: [
    { s: 'mestre', t: '{saudacao}', choices: [
      { t: 'Peça um conselho', next: 'conselho' },
      { t: 'Fale sobre o Arauto', next: 'sobre_arauto' },
      { t: 'Troque de caminho', next: 'trocar' },
      { t: 'Treine sua técnica (árvore de habilidades)', action: 'skills' },
      { t: 'Fortaleça-se com Ecos', action: 'meta' },
      { t: 'Até logo', next: null },
    ] },
  ],
  conselho: [
    { s: 'mestre', t: '{conselho}' },
  ],
  sobre_arauto: [
    { s: 'mestre', t: 'Ele já foi alguém. Ninguém vira Arauto por acaso.' },
    { s: 'mestre', t: 'Mais do que isso eu não sei dizer. Ou não quero.' },
  ],
  trocar: [
    { s: 'mestre', t: 'Hoje você segue o {caminho}. Quer mudar?', choices: [
      { t: 'Mão Aberta — Mago', action: 'classe:mago', next: 'trocado' },
      { t: 'Punho Fechado — Punhos', action: 'classe:punhos', next: 'trocado' },
      { t: 'Manter como está', next: null },
    ] },
  ],
  trocado: [{ s: 'mestre', t: 'Então será o {caminho}. O corpo esquece rápido; a vontade, não.' }],

  // Retorno ao mosteiro
  retorno_morte: [
    { s: 'narrador', t: 'O eco de você se refaz ao pé do Sino partido.' },
    { s: 'mestre', t: '{retorno}' },
  ],
  retorno_vitoria: [
    { s: 'mestre', t: 'O Sino soa de novo. Escute: o mundo está lembrando.' },
    { s: 'mestre', t: 'Mas o Arauto voltará a se formar enquanto houver esquecimento. Se quiser descer outra vez, o portal continua aberto.' },
  ],

  // Chefes
  arauto_intro_0: [
    { s: 'arauto', t: 'Um aprendiz. Rafael continua mandando crianças para o fundo.' },
    { s: 'arauto', t: 'Venha. Vou te ensinar o que ele esqueceu de contar.' },
  ],
  arauto_intro_1: [
    { s: 'arauto', t: 'De novo você. O calor da forja não te faz lembrar de nada?' },
  ],
  arauto_intro_2: [
    { s: 'arauto', t: 'Aqui embaixo tudo congela, até a memória. É o último lugar onde eu fico em paz.' },
    { s: 'arauto', t: 'Não vou deixar você levar isso de mim.' },
  ],
  arauto_derrota_0: [
    { s: 'arauto', t: 'Esse ritmo... é o dele. Ele ainda ensina do mesmo jeito.' },
    { s: 'narrador', t: 'Você recolhe o primeiro fragmento do Sino. Ele vibra, e de dentro dele vem uma voz conhecida.' },
    { s: 'eco', t: 'Um fragmento. Não pare agora. Desça.' },
  ],
  arauto_derrota_1: [
    { s: 'arauto', t: 'Você sente, não sente? O Sino nunca guardou memórias. Ele as prendia.' },
    { s: 'eco', t: 'Não dê ouvidos a ele. Falta só um.' },
  ],
  final: [
    { s: 'arauto', t: 'Leve o último fragmento. E pergunte ao seu mestre por que ele nunca desceu sozinho.' },
    { s: 'narrador', t: 'Os três fragmentos se encontram. O Sino do Eco soa pela primeira vez em uma geração.' },
    { s: 'mestre', t: 'Você conseguiu. O mundo vai voltar a lembrar...' },
    { s: 'mestre', t: '...e eu também vou ter que lembrar do que fiz.' },
    { s: 'narrador', t: 'Fim do primeiro capítulo.' },
  ],
};

// Falas que variam com o progresso
export const CONSELHOS = [
  'Não ataque só porque pode. Ataque quando o outro terminou de atacar.',
  'Os Duelistas fingem. Espere o brilho, não o movimento.',
  'O Bruto bate forte, mas a onda dele corre pelo chão. Pule por cima.',
  'Flechas aparadas voam para onde você olha. Olhe para quem atirou.',
  'A postura do inimigo é a barra amarela. Quebre-a e ele fica à sua mercê.',
  'O Arauto muda de ritmo quando sangra. Na segunda metade, ele não para.',
];

export const RETORNOS = [
  'Você voltou. Respire. O que doeu lá embaixo agora é lição.',
  'O Arauto não é mais forte que você. Só mais paciente.',
  'Cada queda deixa um eco. Os ecos se somam.',
  'Eu também caí muitas vezes, há muito tempo. Levante-se.',
];

export const SAUDACOES = [
  'Pronto para descer de novo?',
  'O Sino espera. Eu também.',
  'Fale, aprendiz.',
];

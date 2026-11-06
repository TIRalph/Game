# Como colocar modelos 3D no jogo

Todo personagem é criado por `createCharacter(chave)` em `src/models.js`. Enquanto não houver um arquivo `.glb` para a chave, o jogo usa um boneco procedural feito de primitivas. Quando houver, usa o modelo com as animações dele. A lógica de combate não muda: ela só pede estados de animação (`play('windup')`, `play('attack1')` etc.).

## Passo a passo

1. Exporte o personagem como **glTF binário (`.glb`)**, com esqueleto e animações no mesmo arquivo. Mixamo + Blender funciona bem.
2. Coloque o arquivo em `assets/models/`, por exemplo `assets/models/mestre.glb`.
3. Em `src/models.js`, preencha a entrada correspondente em `MODEL_MANIFEST`:

```js
mestre: {
  url: 'assets/models/mestre.glb',
  scale: 1,          // ajuste até a altura bater (~1.8 m)
  rotY: Math.PI,     // o jogo considera -Z como frente; a maioria dos .glb olha para +Z
  offsetY: 0,        // suba/desça se o pé não encostar no chão
  anims: {           // estado do jogo -> nome do clipe no .glb
    idle: 'Idle',
    run: 'Running',
    talk: 'Talking',
    death: 'Dying',
  },
  sockets: { handR: 'mixamorigRightHand' }, // ossos usados para efeitos
},
```

4. Recarregue a página. O menu mostra "Carregando modelos…" e libera o botão quando terminar. Se o arquivo falhar, aparece um aviso no console e o placeholder continua no lugar.

## Modelo sem esqueleto (STL / T-pose): rig segmentado

O protagonista veio de um `.stl` em T-pose, sem ossos nem animação. Para esse caso existe o rig **segmentado**: a malha é cortada em partes do corpo e cada parte é presa a uma articulação do rig procedural. Assim o modelo usa as mesmas poses dos placeholders.

```bash
python3 tools/stl_to_segmented_glb.py meu_modelo.stl assets/models/meu_modelo.glb
```

O script lê STL ASCII ou binário (Z para cima, frente para -Y, braços abertos em X), corta pelas alturas do dicionário `JOINTS` no topo do arquivo, pinta cada região com as cores de `MATERIALS` e imprime as juntas em metros. Copie essas juntas para o manifesto:

```js
aprendiz_punhos: {
  url: 'assets/models/protagonista.glb', rig: 'segmented', height: 1.8,
  joints: { hipY: 0.7642, chestY: 0.5844, neckY: 0.1528, shoulderX: 0.2338, upperArm: 0.2607, foreArm: 0.241, hipX: 0.1259, thigh: 0.4226 },
},
```

Para outro modelo em T-pose, ajuste `JOINTS` (altura do quadril, ombros, pescoço, joelho etc. nas unidades do STL). Um jeito rápido de achar os valores é abrir o STL num visualizador e medir. Nomes esperados dos nós no `.glb`: `hips`, `torso`, `head`, `upperArmL/R`, `foreArmL/R`, `thighL/R`, `shinL/R`.

Quando houver uma versão com esqueleto e animações (Mixamo, Blender), basta trocar a entrada para o formato normal (sem `rig: 'segmented'`) e mapear os clipes em `anims`.

## Chaves disponíveis

| Chave | Quem é | Câmera |
|---|---|---|
| `aprendiz_punhos` | Protagonista no Caminho do Punho Fechado (já usa `protagonista.glb`) | 3ª pessoa (corpo inteiro) |
| `protagonista` | Protagonista no fundo do menu | — |
| `aprendiz_mago_maos` | Braços do protagonista no Caminho da Mão Aberta | 1ª pessoa (preso à câmera; use `offset: [x, y, z]`) |
| `mestre` | Mestre Rafael (NPC do mosteiro) | — |
| `boneco` | Boneco de treino | — |
| `carcereiro`, `atirador`, `bruto`, `duelista` | Inimigos comuns | — |
| `arauto` | Chefe | — |

## Estados de animação

O jogo pede estes estados. Mapeie os que o seu modelo tiver; os que faltarem caem em um parecido (tabela `FALLBACK` em `models.js`).

| Estado | Quando toca | Duração |
|---|---|---|
| `idle`, `run`, `jump` | parado, andando, no ar | em loop |
| `attack1`, `attack2`, `attack3` | combo do jogador (punhos) | tempo do golpe |
| `cast1`, `cast2`, `cast3` | mãos do mago (direita, esquerda, as duas) | tempo do golpe |
| `parry` | aparo / guarda / selo | 0,35 s |
| `dodge` | esquiva | 0,24 s |
| `windup` | inimigo preparando golpe aparável | tempo da preparação |
| `windup_heavy` | preparação de golpe pesado / pancada no chão | tempo da preparação |
| `strike`, `strike_heavy` | o golpe em si | ~0,2 s |
| `aim` | arqueiro mirando | tempo da preparação |
| `lunge` | investida | tempo da investida |
| `stagger` | atordoado / postura quebrada | em loop |
| `hit` | levou dano | curto |
| `death` | morreu | 0,6–0,8 s |
| `talk` | NPC falando | em loop |

Quando o jogo passa uma duração, o clipe é acelerado ou desacelerado para caber nela. Isso mantém o **tempo de aparo** igual ao da lógica, que é o que importa para o jogador.

### Usar só um pedaço de um clipe

Se o seu modelo tem um único clipe `Attack`, dá para usar a primeira metade como preparação e o resto como golpe:

```js
anims: {
  windup: { clip: 'Attack', from: 0, to: 0.45 },
  strike: { clip: 'Attack', from: 0.45, to: 1 },
}
```

## Brilho de aviso

O aviso vermelho/laranja (aparável/inaparável) é aplicado como `emissive` em todos os materiais do modelo. Materiais sem `emissive` (por exemplo `MeshBasicMaterial`) não brilham. Prefira `MeshStandardMaterial`, que é o padrão do glTF.

## Hitbox

Colisão e alcance vêm dos números em `ENEMY_TYPES` (`radius`, `height`, `reach`) em `src/enemies.js`, não da malha. Se o modelo for bem maior ou menor que o placeholder, ajuste esses valores.

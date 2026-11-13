# Eco da Lâmina (Unity)

Versão Unity do roguelite. A lógica foi portada do protótipo web (`../src`) quase linha a linha: aparo com janela de tempo, esquiva perfeita com câmera lenta, postura, os 7 tipos de sala, os 3 andares com o Arauto, bênçãos, Santuário dos Ecos, árvores de habilidade dos dois caminhos, o Mestre Rafael, os diálogos e o protagonista.

## Como abrir

1. No Unity Hub: **Add > Add project from disk** e escolha esta pasta (`unity/`).
2. O projeto foi feito para **Unity 6 (6000.0 LTS)**. Também deve abrir no 2022.3 LTS.
3. Se a Unity perguntar sobre o novo Input System, aceite e deixe reiniciar. O código funciona com o Input System novo e com o antigo.
4. Abra qualquer cena (pode ser vazia) e aperte **Play**. O `Bootstrap` cria o jogo inteiro por código: câmera, luzes, salas, personagens e interface.

Não há cenas nem prefabs obrigatórios. Tudo é montado em tempo de execução, então o projeto abre limpo em qualquer máquina.

## Estrutura

```
Assets/
  Scripts/
    Core/        GameManager (loop, estados, salas, combate, mosteiro), Bootstrap, GameInput, Mats, EcoMath
    Data/        GameData (classes, bênçãos, salas, andares, save), Skills (árvores), Story (diálogos)
    Player/      PlayerController + câmeras de 1ª pessoa (Mago) e 3ª pessoa (Punhos)
    Enemies/     Enemy, EnemyDefs (tipos e ataques), Projectile, Shockwave
    Characters/  ICharacterVisual, ProceduralRig, MageHands, ModelLibrary (modelos e prefabs)
    World/       Room (geração das salas, torres, mosteiro, portais)
    FX/          partículas, anéis, raios, números de dano
    UI/          GameUI (menus, HUD, diálogo, árvore, bênçãos, pausa, fim) em IMGUI
    Audio/       Sfx (sons sintetizados na hora)
  Resources/
    Models/protagonista.bytes   protagonista convertido do STL
    Story/dialogos.json         toda a lore e os diálogos
    Shaders/EcoGlow*.shader     brilho aditivo sem luz (projéteis, raios, avisos)
```

## Avisos de ataque e efeitos

Os avisos não dependem de bloom nem de emissão de material, então aparecem igual em qualquer pipeline:

- Inimigo preparando golpe: ícone **"!"** sobre a cabeça (vermelho = **apare**, laranja = **esquive**), luz colorida no corpo e o corpo inteiro tingido na cor.
- Na tela: um anel que **fecha até o instante do golpe** e fica **branco** quando é a hora de apertar, com a palavra APARE ou ESQUIVE. Atacantes fora da tela aparecem como seta na borda.
- Dardos, flechas, raios e partículas usam o shader `Eco/Glow` (aditivo), com núcleo claro, halo, rastro e luz.

## Gravar o trailer (dentro da Unity)

Menu **Eco da Lâmina > Gravar trailer (MP4 + imagens)**. O jogo entra no Play sozinho e roda ~63 s de cenas roteirizadas do próprio jogo (um bot apara e esquiva de verdade, com câmera de cinema, cartelas e a trilha `Resources/Trailer/trailer_musica.ogg`). O **Unity Recorder** grava o MP4 1920×1080 com o som do jogo; ao terminar, sai do Play e abre a pasta `Trailer/` na raiz do projeto Unity, com:

- `eco-da-lamina-trailer.mp4`
- `screenshot-*.png` (com HUD) e `arte-*.png` (só o jogo, sem interface)
- `capa-630x500.png` (capa do itch.io) e `banner-1920x480.png`

**Eco da Lâmina > Só screenshots, capa e banner** faz o mesmo sem gravar vídeo. O roteiro fica em `Scripts/Trailer/TrailerDirector.cs`. Num build, o argumento `-trailer` também roda o diretor.

## Colocar modelos e animações

`ModelLibrary.Create(chave)` procura, nesta ordem:

1. **Prefab com Animator** em `Assets/Resources/Characters/<chave>.prefab`. É o caminho normal para um FBX/GLB com esqueleto (Mixamo, Blender).
2. **Modelo segmentado** (`.bytes` em `Resources/Models`), como o protagonista atual.
3. **Boneco procedural** de primitivas.

Chaves: `aprendiz_punhos` (protagonista em 3ª pessoa), `aprendiz_mago_maos` (braços do mago em 1ª pessoa, preso à câmera), `protagonista` (menu), `mestre`, `boneco`, `carcereiro`, `atirador`, `bruto`, `duelista`, `arauto`.

Para um prefab com Animator, o Animator Controller precisa de **estados com estes nomes** (os que faltarem caem num parecido):

`idle`, `run`, `jump`, `dodge`, `hit`, `stagger`, `death`, `talk`, `attack1`, `attack2`, `attack3`, `parry`, `windup`, `strike`, `windup_heavy`, `strike_heavy`, `aim`, `lunge`, `cast1`, `cast2`, `cast3`.

Ações com duração (golpes, preparação de ataque) são aceleradas para caber no tempo da lógica, então a janela de aparo continua a mesma. O Animator é atualizado à mão, respeitando câmera lenta e hitstop. O brilho de aviso (vermelho/laranja) vai na emissão dos materiais. Hitbox e alcance vêm de `EnemyDefs`, não da malha.

### Protagonista a partir de STL

```bash
python3 tools/stl_to_segmented_glb.py modelo.stl ../assets/models/protagonista.glb --unity Assets/Resources/Models/protagonista.bytes
```

(rodando da raiz do repositório, ajuste os caminhos.) O script corta a malha em T-pose em partes do corpo e grava o `.glb` da versão web e o `.bytes` da Unity, já com frente +Z. As articulações ficam em `ModelLibrary.Segmented`.

## História

Os textos ficam em `Assets/Resources/Story/dialogos.json`: falas `{ s, t }`, escolhas `{ t, action, next, end }` e listas de conselhos, saudações e retornos. Ações tratadas pelo jogo: `classe:mago`, `classe:punhos`, `skills`, `meta`. Para gerar de novo a partir do protótipo web (na raiz do repositório): `node tools/story_to_unity_json.mjs "$PWD/src/story.js" > unity/Assets/Resources/Story/dialogos.json`.

## Controles

WASD mover · mouse olhar · botão esquerdo atacar/lançar · botão direito ou F aparar · Shift esquiva · Espaço pular · E falar · R habilidade · V golpe supremo · Esc pausar.

## Para builds

Os materiais são criados por código com `Shader.Find`. Num build, a Unity só inclui shaders que algum asset usa. Antes de gerar um executável, adicione em **Project Settings > Graphics > Always Included Shaders**: `Standard`, `Unlit/Color` e `Sprites/Default` (na URP: `Universal Render Pipeline/Lit` e `Universal Render Pipeline/Unlit`).

## O que ainda é provisório

- **Interface em IMGUI**: funciona e lê tudo do `GameManager`, mas para a versão final vale trocar por UI Toolkit ou uGUI.
- **Colisão própria**: círculos e limites de sala, como no protótipo, sem física da Unity. Para níveis feitos à mão, troque por `CharacterController`/colliders.
- **IA na Unity**: o plugin Unity-MCP já está instalado; veja [MCP.md](MCP.md) para ligar o Claude ao editor.
- **Save**: JSON em `Application.persistentDataPath/eco-da-lamina-save.json`.

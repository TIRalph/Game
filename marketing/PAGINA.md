# Eco da Lâmina — material de divulgação

Arquivos desta pasta:

| Arquivo | Para quê |
|---|---|
| `trailer/eco-da-lamina-trailer.mp4` | Trailer (1920×1080, 30 fps, ~63 s). Suba no YouTube e cole o link na página do itch.io / Game Jolt. |
| `trailer/eco-da-lamina-combate.gif` | GIF curto de combate (aparo + esquiva) para o corpo da página e redes sociais. |
| `screenshots/screenshot-*.png` | Screenshots 1920×1080. O itch.io aceita até 5 na lateral; use as 5 primeiras. |
| `screenshots/capa-630x500.png` | Capa do itch.io (Cover image, tamanho recomendado 630×500). |
| `screenshots/banner-1920x480.png` | Banner do topo da página (itch.io: Edit theme > Banner; Game Jolt: Header). |
| `screenshots/arte-*.png` | Artes limpas, sem interface, para posts e capas alternativas. |
| `eco-da-lamina-web.zip` | Versão web jogável no navegador. |

O trailer e as imagens foram gravados da versão web do jogo (mesma arte e mecânicas da versão Unity).
Para gerar tudo de novo: `bash tools/trailer/build.sh` (ver o cabeçalho do script).

## Como publicar no itch.io

1. Em itch.io, **Upload new project**.
2. **Kind of project: HTML**. Em *Uploads*, envie `eco-da-lamina-web.zip` e marque **This file will be played in the browser**.
3. *Embed options*: 1280 × 720, marque **Fullscreen button** e **Mobile friendly: não**.
4. Capa: `capa-630x500.png`. Screenshots: as 5 primeiras. *Gameplay video or trailer*: link do YouTube.
5. Gênero: **Action**. Tags sugeridas abaixo. Preço: *No payments* (ou *Name your own price*).

Quando tiver um build da Unity (Windows), envie o `.zip` do build como segundo arquivo, marcado como Windows.

## Como publicar no Game Jolt

1. **Add your game** > preencha título e descrição (abaixo).
2. *Builds*: envie `eco-da-lamina-web.zip` como **HTML/Browser** (dimensões 1280×720).
3. *Media*: screenshots, o GIF e o link do trailer no YouTube. *Header*: `banner-1920x480.png`. *Thumbnail*: `capa-630x500.png`.
4. Categoria **Action**, tags abaixo.

## Texto da página (português)

**Título:** Eco da Lâmina

**Frase curta:** Roguelite de ação em que o tempo é a sua melhor arma. Apare, esquive, lembre.

**Descrição:**

O Sino do Eco guardava a memória do mundo, até o Arauto parti-lo em três. Nas Profundezas, quem cai não morre: vira eco e volta ao Mosteiro, ao pé do Sino partido. Treine com o Mestre Rafael e desça outra vez.

- **Apare no instante exato.** Golpes que brilham em vermelho podem ser aparados e quebram a postura do inimigo. Os laranja só se evitam.
- **Esquive no último segundo** e o mundo desacelera para você: o próximo golpe é crítico.
- **Dois caminhos:** a Mão Aberta (mago em primeira pessoa, com dardos arcanos e selos que refletem) e o Punho Fechado (lutador em terceira pessoa, com combos e guarda).
- **Árvores de habilidade** para cada caminho, com golpes supremos como a Tempestade de Ecos e os Cem Punhos.
- **Salas variadas:** combate, elite, sobrevivência, duelo (só aparos ferem), chuva de flechas e o Arauto no fim de cada andar.
- **21 bênçãos** por run e melhorias permanentes no Santuário dos Ecos.

**Controles:** WASD mover · mouse olhar · clique esquerdo atacar · clique direito ou F aparar · Shift esquivar · Espaço pular · E falar · R habilidade · V golpe supremo.

## Page text (English)

**Title:** Eco da Lâmina (Echo of the Blade)

**Tagline:** An action roguelite where timing is your sharpest weapon. Parry. Dodge. Remember.

**Description:**

The Bell of Echoes held the world's memory, until the Herald shattered it in three. In the Depths, those who fall don't die: they become echoes and return to the Monastery, at the foot of the broken Bell. Train with Master Rafael and descend again.

- **Parry at the exact moment.** Red-glowing attacks can be parried to break the enemy's posture. Orange ones can only be avoided.
- **Dodge at the last second** and the world slows down for you: your next hit is a crit.
- **Two paths:** the Open Hand (first-person mage with arcane bolts and reflecting seals) and the Closed Fist (third-person brawler with combos and guard).
- **Skill trees** for each path, with ultimates like the Echo Storm and the Hundred Fists.
- **Varied rooms:** combat, elite, survival, duel (only parries hurt), arrow rain, and the Herald at the end of each floor.
- **21 boons** per run and permanent upgrades at the Sanctuary of Echoes.

**Controls:** WASD move · mouse look · left click attack · right click or F parry · Shift dodge · Space jump · E talk · R skill · V ultimate.

## Tags sugeridas

roguelite, roguelike, action, parry, souls-like, fantasy, magic, first-person, third-person, singleplayer, browser, 3D

## Post curto para redes sociais

> Fiz um roguelite em que você precisa aparar no instante exato do golpe. Brilho vermelho? Apare. Laranja? Esquive no último segundo e o tempo desacelera. Dois caminhos: mago em 1ª pessoa ou lutador em 3ª. Jogue grátis no navegador: [link]

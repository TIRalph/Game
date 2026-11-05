# Eco da Lâmina

Roguelite de ação focado em **aparo (parry)**, **esquiva no tempo certo** e salas com estilos de jogo diferentes, com uma história que liga as expedições. Feito com Three.js, roda direto no navegador, sem etapa de build.

O projeto é uma **base**: todos os personagens são placeholders procedurais que podem ser trocados por modelos `.glb` sem mexer na lógica. Veja [docs/MODELOS.md](docs/MODELOS.md).

## História

O Sino do Eco guardava a memória do mundo até o Arauto parti-lo em três. Você sobe ao Mosteiro do Eco e encontra o **Mestre Oren**, último guardião do Sino. Nas Profundezas, quem cai vira eco e volta ao mosteiro, e é isso que justifica o ciclo do roguelite. Os diálogos ficam em `src/story.js`.

## Caminhos (classes)

| Caminho | Câmera | Estilo |
|---|---|---|
| **Mão Aberta — Mago** | 1ª pessoa, mãos visíveis | Dardos arcanos à distância (o 3º explode), selo rúnico que apara e reflete, lampejo rápido |
| **Punho Fechado — Punhos** | 3ª pessoa, câmera de ombro | Combos de soco com mira automática no inimigo próximo, guarda, +1 esquiva, 3º golpe abala o chão |

O caminho é escolhido no prólogo com o Mestre e pode ser trocado falando com ele no mosteiro.

## Como rodar

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

Qualquer servidor estático serve (precisa ser via HTTP por causa dos módulos ES). O Three.js r160 já está em `vendor/`.

## Controles

| Ação | Tecla |
|---|---|
| Mover / olhar | WASD / mouse |
| Atacar / lançar (ritmo de 3) | Botão esquerdo |
| Aparar (selo ou guarda) | Botão direito ou F |
| Falar / interagir | E |
| Esquiva (dash com invencibilidade) | Shift (ou Q) |
| Pular | Espaço |
| Pausar | Esc |

## Mecânicas centrais

- **Aparo**: cada arma tem uma janela (~150–240 ms). Aparar no instante do golpe anula o dano, gera dano de postura e atordoa o inimigo (seus golpes nele viram crítico). Projéteis aparados são **refletidos para onde você mira**.
- **Leitura de ataques**: brilho **vermelho** = aparável, **laranja** = inaparável (esquive), **anel azul no chão** = onda de choque (pule ou esquive).
- **Esquiva perfeita**: esquivar nos primeiros 200 ms antes do golpe ativa câmera lenta, devolve uma carga de esquiva e deixa o próximo golpe crítico.
- **Postura**: barra amarela. Quando enche, o inimigo fica **quebrado** e recebe dano triplo.
- **Duelistas** fazem fintas (o tempo de preparação varia), então é preciso reagir, não decorar.

## Estrutura da run

Do Mosteiro (hub, com o Mestre e um boneco de treino) você desce pelo portal. São 3 andares (Cripta Esquecida, Forja Rubra, Abismo Glacial), cada um com 5 salas + chefe. O Arauto fala antes e depois de cada luta. Depois de cada sala você escolhe o próximo portal:

| Sala | Gameplay |
|---|---|
| Combate | Ondas de inimigos |
| Elite | Inimigos reforçados, recompensa rara |
| Sobrevivência | Aguentar o cronômetro com spawns infinitos |
| Duelo | Só aparos e golpes em inimigos atordoados causam dano |
| Chuva de Flechas | Arqueiros em torres: reflita as flechas (o mago também acerta com dardos) |
| Santuário | Cura + bênção grátis |
| Chefe | O Arauto: combos, investidas, ondas de choque, leques de projéteis e fase 2 |

**Bênçãos** (21) modificam a run: aparo vampírico, eco de choque, esquiva explosiva, reflexo teleguiado, fúria rítmica, lâmina projetada etc.

**Progressão permanente**: Ecos ganhos em cada run são gastos no Santuário dos Ecos (pelo menu ou falando com o Mestre): vida, dano, janela de aparo, mais opções de bênção, revive. O save fica no `localStorage`.

## Código

```
index.html        UI (menus, HUD)
style.css
src/main.js       inicialização e telas
src/game.js       loop, estados, mosteiro, salas, resolução de combate
src/player.js     jogador + câmeras (1ª pessoa do mago, 3ª pessoa dos punhos)
src/models.js     camada de modelos: manifesto .glb + placeholders procedurais
src/story.js      lore e diálogos
src/dialogue.js   caixa de diálogo com escolhas
src/enemies.js    inimigos, ataques, projéteis, ondas de choque
src/world.js      geração das salas, mosteiro e portais
src/data.js       classes, bênçãos, melhorias, tipos de sala
src/fx.js         partículas, números de dano, efeitos de tela
src/audio.js      efeitos sonoros sintetizados (WebAudio)
assets/models/    coloque aqui os .glb (ver docs/MODELOS.md)
```

Para depurar, o objeto `window.game` fica exposto no console.

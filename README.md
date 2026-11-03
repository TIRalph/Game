# Eco da Lâmina

Roguelite de ação em primeira pessoa focado em **aparo (parry)**, **esquiva no tempo certo** e salas com estilos de jogo diferentes. Feito com Three.js, roda direto no navegador, sem etapa de build.

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
| Atacar (combo de 3) | Botão esquerdo |
| Aparar | Botão direito ou F |
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

3 andares (Cripta Esquecida, Forja Rubra, Abismo Glacial), cada um com 5 salas + chefe. Depois de cada sala você escolhe o próximo portal:

| Sala | Gameplay |
|---|---|
| Combate | Ondas de inimigos |
| Elite | Inimigos reforçados, recompensa rara |
| Sobrevivência | Aguentar o cronômetro com spawns infinitos |
| Duelo | Só aparos e golpes em inimigos atordoados causam dano |
| Chuva de Flechas | Arqueiros em torres, só morrem com flechas refletidas |
| Santuário | Cura + bênção grátis |
| Chefe | O Arauto: combos, investidas, ondas de choque, leques de projéteis e fase 2 |

**Bênçãos** (21) modificam a run: aparo vampírico, eco de choque, esquiva explosiva, reflexo teleguiado, fúria rítmica, lâmina projetada etc.

**Armas**: Espada (equilibrada), Adagas Gêmeas (rápidas, +1 esquiva) e Martelo (lento, dano de postura x2, onda no 3º golpe). Adagas e Martelo se desbloqueiam com Ecos.

**Progressão permanente**: Ecos ganhos em cada run são gastos no Santuário dos Ecos (vida, dano, janela de aparo, mais opções de bênção, revive). O save fica no `localStorage`.

## Código

```
index.html        UI (menus, HUD)
style.css
src/main.js       inicialização e telas
src/game.js       loop, estados, salas, resolução de combate
src/player.js     controle FPS, ataque, aparo, esquiva, viewmodel
src/enemies.js    inimigos, ataques, projéteis, ondas de choque
src/world.js      geração das salas e portais
src/data.js       armas, bênçãos, melhorias, tipos de sala
src/fx.js         partículas, números de dano, efeitos de tela
src/audio.js      efeitos sonoros sintetizados (WebAudio)
```

Para depurar, o objeto `window.game` fica exposto no console.

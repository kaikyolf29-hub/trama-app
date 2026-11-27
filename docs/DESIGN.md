# Design do Trama

Tokens, regras visuais e componentes. Os valores moram em
[`packages/ui/tokens.ts`](../packages/ui/tokens.ts), o único arquivo com cores escritas; este
documento explica o que cada um é e quando usar. As telas de referência estão em
[`docs/telas/`](telas/), e a vitrine viva dos componentes abre em `pnpm dev` →
http://localhost:5173/#design.

## Princípios

- **O quadro vem primeiro.** Abrir e começar a arrastar leva segundos.
- **Preto e branco, sem cara de IA.** Nada de degradê, emoji ou brilho. Cor só dá significado:
  seleção, concluído, notas.
- **Escuro é o padrão.** O modo claro vem depois, com os mesmos nomes de token.

## Cores

| Token (`colors.*`)                      | Classe Tailwind                                    | Uso                                                   |
| --------------------------------------- | -------------------------------------------------- | ----------------------------------------------------- |
| `canvas`, `canvasDot`                   | `bg-canvas`, `bg-canvas-dots`                      | Fundo do quadro, com pontos a cada 24 px (tela 1)     |
| `page`, `sidebar`                       | `bg-page`, `bg-sidebar`                            | Páginas estilo Notion e a barra lateral (telas 3 a 7) |
| `surface`                               | `bg-surface`                                       | Blocos e painéis                                      |
| `floating`                              | `bg-floating`                                      | Ferramentas e barras que flutuam sobre o quadro       |
| `field`                                 | `bg-field`                                         | Campos de formulário                                  |
| `hover`                                 | `bg-hover`                                         | Item ativo ou com o cursor em cima                    |
| `border`, `borderSubtle`                | `border-border`, `border-border-subtle`            | Bordas; a sutil separa linhas de tabela               |
| `textStrong`, `text`, `textMuted`       | `text-text-strong`, `text-text`, `text-text-muted` | Títulos, texto, texto discreto                        |
| `selection`                             | `outline-selection`, `bg-selection`                | Contorno, alças, pontos de conexão e foco             |
| `done`, `doneText`, `doneSurface`       | `bg-done`, `text-done-text`, `bg-done-surface`     | "Vídeo pronto", etapas feitas, sucesso                |
| `brandPaper`, `brandInk`, `brandShadow` | `bg-brand-paper`, `text-brand-ink`                 | O logo e o botão principal                            |

**Notas** (`noteColors.*`, classes `bg-note-<cor>-bg` e `text-note-<cor>-fg`): amarelo, azul,
verde e rosa. Servem às notas adesivas, às etiquetas e aos avisos: o rosa marca erro, o azul
marca informação.

O tema do Tailwind é montado dos tokens e **substitui a paleta padrão**: `bg-red-500` ou
`text-white` nem existem. O lint recusa hex fora de `tokens.ts`, no código e no CSS.

Os dados do fluxo guardam os **nomes** (`yellow`, `strong`, `serif`), nunca o valor. Os testes de
`packages/ui` conferem que cada nome do `@trama/core` tem valor e que todo texto passa no
contraste AA (4,5:1).

## Tipografia

| Token (`fonts.*`) | Família        | Uso                                    |
| ----------------- | -------------- | -------------------------------------- |
| `sans`            | Inter          | Toda a interface (padrão)              |
| `serif`           | Lora           | Títulos de página e a opção "Serifa"   |
| `mono`            | JetBrains Mono | A opção "Mono" do bloco de texto       |
| `hand`            | Caveat         | A opção "Manuscrita" do bloco de texto |

As fontes vêm do próprio site (pacotes `@fontsource-variable`), sem chamar o Google Fonts. Corpo
em 14 px; rótulos em 13 px; títulos de página em Lora 600.

## Espaço, forma e movimento

- **Grade de 8 px** (`GRID`): espaçamentos e tamanhos em múltiplos de 8; blocos do mesmo tipo,
  do mesmo tamanho.
- **Raios** (`radius.*`): blocos e painéis 12 px, botões e campos 8 px, etiquetas e notas 4 px.
- **Sombras** (`shadows.*`): discreta nos blocos (`shadow-block`) e mais forte só nos menus e
  barras flutuantes (`shadow-floating`).
- **Movimento** (`motion.*`): cerca de 150 ms ao criar, mover e conectar; respeite
  `prefers-reduced-motion`.

## Componentes (`@trama/ui`)

| Componente         | Para quê                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| `Button`           | `primary` (claro sobre o escuro, como o "Apresentar"), `secondary`, `ghost`; `loading` bloqueia cliques |
| `TextField`        | Campo com rótulo, dica e erro ligados por `aria-describedby`                                            |
| `PasswordField`    | Campo de senha com "Mostrar" e "Ocultar"                                                                |
| `Alert`            | Aviso de erro (anunciado), sucesso ou informação                                                        |
| `Logo`, `LogoMark` | O "T" com serifa e ponto de conexão, com ou sem o nome                                                  |
| `Spinner`          | Carregamento discreto                                                                                   |

Regras de acessibilidade: botões e links de verdade, rótulo em todo campo, foco visível com a cor
de seleção, ícone sem texto com `aria-label`.

## Logo

Um "T" com serifa, como nos livros, terminando num ponto de conexão igual à ponta de uma seta no
quadro, num bloco com borda e sombra dura. Só preto e branco (tela 8). Use `LogoMark` no lugar do
ícone e `Logo` quando o nome acompanha. O favicon é `apps/web/public/favicon.svg`.

/**
 * Tokens de design do Trama: o ÚNICO lugar do repositório onde uma cor é escrita
 * (AGENTS.md, "O que nunca fazer"). Valores de docs/PLAN.md, "Tokens de design", e
 * das telas de docs/telas/. O app, o Tailwind e os e-mails leem daqui.
 *
 * O modo escuro é o padrão. O modo claro vem depois, com os mesmos nomes.
 */
import type { NoteColor, TextColor, TextFont } from '@trama/core';

/** As quatro cores das notas adesivas: fundo e texto (Notion escuro). */
export const noteColors = {
  yellow: { bg: '#3B3110', fg: '#F1DE8E' },
  blue: { bg: '#1D2B3A', fg: '#A9CDF0' },
  green: { bg: '#1F2E27', fg: '#93D6BA' },
  pink: { bg: '#3A2030', fg: '#EDB1CE' },
} as const satisfies Record<NoteColor, { bg: string; fg: string }>;

export const colors = {
  /** Fundo do quadro, com pontos `canvasDot` a cada 24 px. */
  canvas: '#161616',
  canvasDot: '#2A2A2A',
  /** Fundo das páginas estilo Notion e da barra lateral. */
  page: '#191919',
  sidebar: '#202020',
  /** Blocos e painéis. */
  surface: '#222222',
  /** Ferramentas e barras flutuantes sobre o quadro. */
  floating: '#1F1F1F',
  /** Campos de formulário. */
  field: '#252525',
  /** Item ativo ou com o cursor em cima. */
  hover: '#2C2C2C',
  /** Fundo e borda das molduras do quadro (tela 1). */
  frame: 'rgba(255, 255, 255, 0.025)',
  frameBorder: '#2C2C2C',
  /** Traço das setas no quadro. */
  arrow: '#5E5E5E',
  /** Véu do minimapa sobre o que está fora da tela. */
  overlay: 'rgba(22, 22, 22, 0.6)',
  border: '#333333',
  borderSubtle: '#2B2B2B',
  textStrong: '#F0F0F0',
  text: '#D4D4D4',
  textMuted: '#9B9B9B',
  /** Seleção: contorno, alças, pontos de conexão e foco do teclado. */
  selection: '#2383E2',
  /** Concluído: "Vídeo pronto", etapas feitas. */
  done: '#4DAB9A',
  doneText: '#7DD3BE',
  doneSurface: 'rgba(77, 171, 154, 0.16)',
  /** Logo e o botão principal (claro sobre o escuro). */
  brandPaper: '#F2F2F2',
  brandInk: '#111111',
  brandShadow: '#000000',
} as const;

/** Cor do texto dos blocos (nomes guardados em `@trama/core`). */
export const textColors = {
  strong: colors.textStrong,
  normal: colors.text,
  muted: colors.textMuted,
  yellow: noteColors.yellow.fg,
  blue: noteColors.blue.fg,
  green: noteColors.green.fg,
  pink: noteColors.pink.fg,
} as const satisfies Record<TextColor, string>;

/** Fontes: Inter na interface, Lora em títulos e na opção serifada. */
export const fonts = {
  sans: '"Inter Variable", Inter, system-ui, -apple-system, "Segoe UI", sans-serif',
  serif: '"Lora Variable", Lora, Georgia, "Times New Roman", serif',
  mono: '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, monospace',
  hand: '"Caveat Variable", Caveat, "Segoe Print", "Bradley Hand", cursive',
} as const satisfies Record<TextFont, string>;

/** Tudo encaixa numa grade de 8 px. */
export const GRID = 8;

export const radius = {
  /** Blocos e painéis. */
  block: '12px',
  /** Molduras do quadro. */
  frame: '16px',
  /** Botões e campos. */
  control: '8px',
  /** Etiquetas e selos. */
  tag: '4px',
  /** Notas adesivas. */
  sticky: '4px',
} as const;

export const shadows = {
  /** Sombra discreta dos blocos. */
  block: '0 8px 24px rgba(0, 0, 0, 0.28)',
  /** Menus e barras flutuantes. */
  floating: '0 10px 28px rgba(0, 0, 0, 0.45)',
} as const;

/** Animações curtas, em torno de 150 ms, ao criar, mover e conectar. */
export const motion = {
  duration: '150ms',
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
} as const;

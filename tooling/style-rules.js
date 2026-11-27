// Regras visuais do AGENTS.md que o lint garante ("O que nunca fazer").
// Usadas pelo eslint.config.js e pelo stylelint.config.js; testadas em style-rules.test.js.

/** O único arquivo onde uma cor pode ser escrita em hex. */
export const TOKEN_FILE = 'packages/ui/tokens.ts';

/** Código de interface: onde valem as regras de cor e de emoji. */
export const UI_FILES = [
  'apps/web/src/**/*.{ts,tsx}',
  'packages/canvas/**/*.{ts,tsx}',
  'packages/ui/**/*.{ts,tsx}',
  'packages/emails/**/*.{ts,tsx}',
];

const HEX_COLOR = String.raw`#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b`;

// Pictogramas, indicadores regionais (bandeiras), o seletor de apresentação emoji
// (U+FE0F) e o teclado (U+20E3). Cobre também as sequências: toda sequência de emoji
// tem ao menos um desses pontos de código.
const EMOJI = String.raw`[\p{Extended_Pictographic}\p{Regional_Indicator}\u{FE0F}\u{20E3}]`;

const TEXT_NODES = ['Literal[value=', 'TemplateElement[value.raw=', 'JSXText[value='];

const HEX_MESSAGE = 'Cor fora dos tokens. Use um token de packages/ui/tokens.ts.';
const EMOJI_MESSAGE = 'Emoji na interface não. Use um ícone.';

/** Entradas para a regra no-restricted-syntax do ESLint. */
export const noHexColors = TEXT_NODES.map((node) => ({
  selector: `${node}/${HEX_COLOR}/]`,
  message: HEX_MESSAGE,
}));

export const noEmoji = TEXT_NODES.map((node) => ({
  selector: `${node}/${EMOJI}/u]`,
  message: EMOJI_MESSAGE,
}));

/** Folhas de estilo: nenhuma cor em hex; use as variáveis dos tokens. */
export const stylelintConfig = {
  rules: {
    'color-no-hex': [true, { message: HEX_MESSAGE }],
  },
  ignoreFiles: ['**/dist/**', '**/coverage/**', '**/node_modules/**'],
};

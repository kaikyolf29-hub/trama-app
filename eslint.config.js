import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Código de interface: onde valem as regras visuais do AGENTS.md.
const UI_FILES = [
  'apps/web/src/**/*.{ts,tsx}',
  'packages/canvas/**/*.{ts,tsx}',
  'packages/ui/**/*.{ts,tsx}',
  'packages/emails/**/*.{ts,tsx}',
];
// O único lugar onde uma cor pode ser escrita em hex.
const TOKEN_FILES = ['packages/ui/tokens.ts', 'packages/ui/src/tokens.ts'];

const HEX = String.raw`/#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/`;
const EMOJI = String.raw`/\p{Extended_Pictographic}/u`;

const noHexColors = ['Literal[value=', 'TemplateElement[value.raw=', 'JSXText[value='].map(
  (node) => ({
    selector: `${node}${HEX}]`,
    message: 'Cor fora dos tokens. Use um token de packages/ui/tokens.ts.',
  }),
);
const noEmoji = ['Literal[value=', 'TemplateElement[value.raw=', 'JSXText[value='].map((node) => ({
  selector: `${node}${EMOJI}]`,
  message: 'Emoji na interface não. Use um ícone.',
}));

export default defineConfig([
  globalIgnores(['**/dist/', '**/coverage/', '**/.turbo/', '**/.wrangler/']),

  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },

  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },

  {
    files: ['apps/web/**/*.{ts,tsx}', 'packages/{canvas,ui,emails}/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },

  {
    files: UI_FILES,
    ignores: ['**/*.test.{ts,tsx}', ...TOKEN_FILES],
    rules: { 'no-restricted-syntax': ['error', ...noHexColors, ...noEmoji] },
  },
  {
    files: TOKEN_FILES,
    rules: { 'no-restricted-syntax': ['error', ...noEmoji] },
  },
]);

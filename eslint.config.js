import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { TOKEN_FILE, UI_FILES, noEmoji, noHexColors } from './tooling/style-rules.js';

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

  // Regras visuais do AGENTS.md (tooling/style-rules.js). O CSS é checado pelo Stylelint.
  {
    files: UI_FILES,
    ignores: ['**/*.test.{ts,tsx}', TOKEN_FILE],
    rules: { 'no-restricted-syntax': ['error', ...noHexColors, ...noEmoji] },
  },
  {
    files: [TOKEN_FILE],
    rules: { 'no-restricted-syntax': ['error', ...noEmoji] },
  },
]);

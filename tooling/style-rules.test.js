import { ESLint } from 'eslint';
import stylelint from 'stylelint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { noEmoji, noHexColors, stylelintConfig } from './style-rules.js';

const eslint = new ESLint({
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ['**/*.tsx'],
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      rules: { 'no-restricted-syntax': ['error', ...noHexColors, ...noEmoji] },
    },
  ],
});

async function lintTsx(code) {
  const [result] = await eslint.lintText(code, { filePath: 'tela.tsx' });
  return result.messages.map((message) => message.message);
}

const asString = (text) => `export const a = ${JSON.stringify(text)};`;
const asTemplate = (text) => `export const a = \`${text}\`;`;
const asJsx = (text) => `export const A = () => <p>${text}</p>;`;

describe('ESLint: emoji na interface', () => {
  it.each([
    ['claquete', 'Pronto 🎬'],
    ['bandeira (indicadores regionais)', 'Brasil 🇧🇷'],
    ['tecla com U+FE0F', 'Passo 1️⃣'],
    ['tecla sem U+FE0F', 'Passo 1⃣'],
    ['sequência com ZWJ', 'Dev 👩‍💻'],
    ['símbolo com apresentação emoji', 'Amei ❤️'],
  ])('recusa %s', async (_, text) => {
    for (const code of [asString(text), asTemplate(text), asJsx(text)]) {
      expect(await lintTsx(code)).toContain('Emoji na interface não. Use um ícone.');
    }
  });

  it.each(['Pronto', 'Voltar →', 'Lora ▾', '▸ Plano aberto', 'Esc para sair · ← →'])(
    'aceita texto comum: %s',
    async (text) => {
      expect(await lintTsx(asJsx(text))).toEqual([]);
    },
  );
});

describe('ESLint: cor fora dos tokens', () => {
  it.each([
    asString('#abc'),
    asString('#2383E2'),
    asString('#2383E2cc'),
    asString('bg-[#161616]'),
    asTemplate('0 0 0 1px #333333'),
    asJsx('#FFF'),
  ])('recusa hex em %s', async (code) => {
    expect(await lintTsx(code)).toContain(
      'Cor fora dos tokens. Use um token de packages/ui/tokens.ts.',
    );
  });

  it.each([asString('Tarefa #12'), asString('var(--trama-selection)'), asJsx('Short #4')])(
    'aceita %s',
    async (code) => {
      expect(await lintTsx(code)).toEqual([]);
    },
  );
});

describe('Stylelint: cor fora dos tokens no CSS', () => {
  async function lintCss(code) {
    const { results } = await stylelint.lint({ code, config: stylelintConfig });
    return results[0]?.warnings.map((warning) => warning.text) ?? [];
  }

  it('recusa hex numa folha de estilo', async () => {
    const warnings = await lintCss('.note { color: #abc; }');
    expect(warnings.join('\n')).toContain('Cor fora dos tokens');
  });

  it('recusa hex dentro de outras propriedades', async () => {
    expect(await lintCss('.bloco { box-shadow: 0 8px 24px #00000047; }')).toHaveLength(1);
  });

  it('aceita a referência a um token', async () => {
    expect(await lintCss('.note { color: var(--trama-note-yellow-fg); }')).toEqual([]);
  });
});

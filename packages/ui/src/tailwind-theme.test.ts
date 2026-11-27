import { describe, expect, it } from 'vitest';
import { colors } from '../tokens';
import { tailwindTheme } from './tailwind-theme';

describe('tailwindTheme', () => {
  it('nomeia as cores em kebab-case, como as classes usam (bg-text-strong)', () => {
    expect(tailwindTheme.colors['text-strong']).toBe(colors.textStrong);
    expect(tailwindTheme.colors['border-subtle']).toBe(colors.borderSubtle);
    expect(Object.keys(tailwindTheme.colors).some((key) => /[A-Z]/.test(key))).toBe(false);
  });

  it('não traz a paleta padrão do Tailwind', () => {
    expect(tailwindTheme.colors).not.toHaveProperty('red');
    expect(tailwindTheme.colors).not.toHaveProperty('white');
  });
});

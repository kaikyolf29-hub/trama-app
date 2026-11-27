import { noteColorSchema, textColorSchema, textFontSchema } from '@trama/core';
import { describe, expect, it } from 'vitest';
import { colors, fonts, noteColors, textColors } from './tokens';

/** Contraste WCAG 2 entre duas cores em hex (#RRGGBB). */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('tokens', () => {
  it('têm um valor para cada nome que o fluxo guarda', () => {
    expect(Object.keys(noteColors).sort()).toEqual([...noteColorSchema.options].sort());
    expect(Object.keys(textColors).sort()).toEqual([...textColorSchema.options].sort());
    expect(Object.keys(fonts).sort()).toEqual([...textFontSchema.options].sort());
  });

  it.each([
    ['textStrong', 'surface'],
    ['text', 'surface'],
    ['textMuted', 'surface'],
    ['textMuted', 'canvas'],
    ['textMuted', 'page'],
    ['textMuted', 'field'],
    ['text', 'hover'],
  ] as const)('%s sobre %s tem contraste AA (4,5:1)', (fg, bg) => {
    expect(contrast(colors[fg], colors[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(Object.entries(noteColors))('a nota %s tem texto legível (4,5:1)', (_, { bg, fg }) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('o botão principal (tinta sobre papel) tem contraste AA', () => {
    expect(contrast(colors.brandInk, colors.textStrong)).toBeGreaterThanOrEqual(4.5);
  });
});

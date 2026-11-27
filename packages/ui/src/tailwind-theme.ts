import { colors, fonts, motion, noteColors, radius, shadows } from '../tokens';

/** `textStrong` vira `text-strong`, para as classes saírem como `bg-text-strong`. */
function kebabKeys<T extends Record<string, unknown>>(object: T): Record<string, T[keyof T]> {
  return Object.fromEntries(
    Object.entries(object).map(([key, value]) => [
      key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
      value as T[keyof T],
    ]),
  );
}

/**
 * Tema do Tailwind montado a partir dos tokens. Substitui a paleta padrão do Tailwind
 * inteira: `bg-red-500` nem existe, e só sobram as cores do Trama.
 */
const themeColors: Record<string, string | typeof noteColors> = {
  transparent: 'transparent',
  current: 'currentColor',
  inherit: 'inherit',
  ...kebabKeys(colors),
  note: noteColors,
};

export const tailwindTheme = {
  colors: themeColors,
  fontFamily: {
    sans: [fonts.sans],
    serif: [fonts.serif],
    mono: [fonts.mono],
    hand: [fonts.hand],
  },
  extend: {
    borderRadius: radius,
    boxShadow: shadows,
    transitionDuration: { DEFAULT: motion.duration },
    transitionTimingFunction: { DEFAULT: motion.easing },
  },
};

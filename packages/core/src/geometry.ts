import { z } from 'zod';

/** Tudo no quadro encaixa numa grade de 8 px (docs/PLAN.md, "Interações"). */
export const GRID_SIZE = 8;

/** Identificador de bloco, moldura, seta, passo ou item. Gerado por quem cria (ex.: crypto.randomUUID()). */
export const idSchema = z.string().min(1).max(64);

/** Ponto no quadro, em px, sempre absoluto (nunca relativo à moldura). */
export const pointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const sizeSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
});

/** Câmera do quadro: deslocamento e zoom. */
export const viewportSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number().positive(),
});

export type Id = z.infer<typeof idSchema>;
export type Point = z.infer<typeof pointSchema>;
export type Size = z.infer<typeof sizeSchema>;
export type Viewport = z.infer<typeof viewportSchema>;

/** Arredonda um valor para o múltiplo mais próximo da grade. */
export function snapToGrid(value: number, grid: number = GRID_SIZE): number {
  // `+ 0` evita devolver -0 para valores negativos pequenos.
  return Math.round(value / grid) * grid + 0;
}

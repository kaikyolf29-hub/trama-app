import { z } from 'zod';
import { idSchema, pointSchema, sizeSchema } from './geometry';

/**
 * Moldura (tecla F): agrupa blocos, dá nome à seção e pode virar um passo do
 * modo aula. Os blocos apontam para ela com `frameId`. Molduras não se aninham.
 */
export const frameSchema = z.object({
  id: idSchema,
  title: z.string().max(120).default(''),
  position: pointSchema,
  size: sizeSchema,
  locked: z.boolean().default(false),
  zIndex: z.number().int().default(0),
});

export type Frame = z.infer<typeof frameSchema>;
export type FrameInput = z.input<typeof frameSchema>;

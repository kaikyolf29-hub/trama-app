import { z } from 'zod';
import { idSchema } from './geometry';

/** Lado da borda de onde a seta sai ou onde chega (sempre no meio da borda). */
export const anchorSideSchema = z.enum(['top', 'right', 'bottom', 'left']);
export type AnchorSide = z.infer<typeof anchorSideSchema>;

/** Ponta da seta: um nó (bloco ou moldura) e, opcionalmente, o lado. Sem lado, o quadro escolhe o mais próximo. */
export const arrowEndSchema = z.object({
  nodeId: idSchema,
  side: anchorSideSchema.optional(),
});

export const arrowRouteSchema = z.enum(['curved', 'straight']);
export type ArrowRoute = z.infer<typeof arrowRouteSchema>;

/** Seta: liga dois nós, segue os blocos quando eles se movem, curva ou reta, com texto opcional. */
export const arrowSchema = z
  .object({
    id: idSchema,
    from: arrowEndSchema,
    to: arrowEndSchema,
    route: arrowRouteSchema.default('curved'),
    label: z.string().max(200).optional(),
  })
  .refine((arrow) => arrow.from.nodeId !== arrow.to.nodeId, {
    message: 'a seta precisa ligar dois nós diferentes',
    path: ['to', 'nodeId'],
  });

export type ArrowEnd = z.infer<typeof arrowEndSchema>;
export type Arrow = z.infer<typeof arrowSchema>;
export type ArrowInput = z.input<typeof arrowSchema>;

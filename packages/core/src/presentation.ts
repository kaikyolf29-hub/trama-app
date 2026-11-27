import { z } from 'zod';
import { idSchema } from './geometry';

/**
 * Passo do modo aula. A ordem da lista `presentation` do fluxo é a ordem da
 * apresentação: o primeiro item é o passo 1. Um passo revela um ou mais nós
 * (blocos ou molduras) ao mesmo tempo, e cada nó fica em no máximo um passo.
 */
export const presentationStepSchema = z.object({
  id: idSchema,
  targetIds: z.array(idSchema).min(1),
  title: z.string().max(120).optional(),
});

export type PresentationStep = z.infer<typeof presentationStepSchema>;
export type PresentationStepInput = z.input<typeof presentationStepSchema>;

/** Número do passo (começando em 1) em que o nó aparece, ou undefined se não está em nenhum. */
export function presentationStepNumber(
  steps: readonly Pick<PresentationStep, 'targetIds'>[],
  nodeId: string,
): number | undefined {
  const index = steps.findIndex((step) => step.targetIds.includes(nodeId));
  return index === -1 ? undefined : index + 1;
}

import type { PresentationStep } from '@trama/core';
import { newId } from './create';

/** Onde pôr o nó no modo aula: num passo que já existe (número), num passo novo, ou fora. */
export type StepTarget = number | 'new' | null;

/**
 * Põe o nó num passo da aula (cada nó fica em no máximo um passo). Passos que ficam vazios
 * somem, e a numeração anda junto.
 */
export function setNodeStep(
  presentation: readonly PresentationStep[],
  nodeId: string,
  target: StepTarget,
): PresentationStep[] {
  const without = presentation.map((step) => ({
    ...step,
    targetIds: step.targetIds.filter((id) => id !== nodeId),
  }));
  const placed =
    target === 'new'
      ? [...without, { id: newId(), targetIds: [nodeId] }]
      : target === null
        ? without
        : without.map((step, index) =>
            index === target - 1 ? { ...step, targetIds: [...step.targetIds, nodeId] } : step,
          );
  return placed.filter((step) => step.targetIds.length > 0);
}

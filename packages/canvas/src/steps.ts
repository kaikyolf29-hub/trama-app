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

/** Move o passo da posição `from` para `to` (começando em 0); a numeração anda junto. */
export function moveStep(
  presentation: readonly PresentationStep[],
  from: number,
  to: number,
): PresentationStep[] {
  const last = presentation.length - 1;
  if (from < 0 || from > last || to < 0 || to > last || from === to) return [...presentation];
  const next = [...presentation];
  const [moved] = next.splice(from, 1);
  if (moved) next.splice(to, 0, moved);
  return next;
}

/** Limite do nome do passo (o mesmo do core). */
export const MAX_STEP_TITLE = 120;

/** Dá nome ao passo. Nome vazio tira o nome: a lista volta a mostrar o nome dos nós. */
export function renameStep(
  presentation: readonly PresentationStep[],
  stepId: string,
  title: string,
): PresentationStep[] {
  const clean = title.trim().slice(0, MAX_STEP_TITLE);
  return presentation.map((step) => {
    if (step.id !== stepId) return step;
    const { title: _old, ...rest } = step;
    return clean ? { ...rest, title: clean } : rest;
  });
}

/** Apaga o passo. Os nós dele ficam no quadro, só deixam de fazer parte da aula. */
export function removeStep(
  presentation: readonly PresentationStep[],
  stepId: string,
): PresentationStep[] {
  return presentation.filter((step) => step.id !== stepId);
}

/**
 * Cria um passo no fim com os nós dados ("Adicionar a seleção como passo"). Cada nó fica em
 * um passo só: sai do que estava, e o passo que ficar vazio some.
 */
export function addStep(
  presentation: readonly PresentationStep[],
  nodeIds: readonly string[],
): PresentationStep[] {
  const ids = [...new Set(nodeIds)];
  if (ids.length === 0) return [...presentation];
  const without = presentation
    .map((step) => ({ ...step, targetIds: step.targetIds.filter((id) => !ids.includes(id)) }))
    .filter((step) => step.targetIds.length > 0);
  return [...without, { id: newId(), targetIds: ids }];
}

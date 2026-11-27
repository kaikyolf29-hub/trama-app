import type { FlowContent } from '@trama/core';

/**
 * Tira nós (blocos e molduras) do fluxo sem deixar nada apontando para eles: some com as
 * setas ligadas, tira dos passos da aula (e apaga o passo que ficar vazio) e solta da
 * moldura os blocos cuja moldura saiu.
 */
export function removeNodes(flow: FlowContent, ids: Iterable<string>): FlowContent {
  const gone = new Set(ids);
  if (gone.size === 0) return flow;
  return {
    ...flow,
    blocks: flow.blocks
      .filter((block) => !gone.has(block.id))
      .map((block) => {
        if (!block.frameId || !gone.has(block.frameId)) return block;
        const { frameId: _detached, ...rest } = block;
        return rest;
      }),
    frames: flow.frames.filter((frame) => !gone.has(frame.id)),
    arrows: flow.arrows.filter(
      (arrow) => !gone.has(arrow.id) && !gone.has(arrow.from.nodeId) && !gone.has(arrow.to.nodeId),
    ),
    presentation: flow.presentation
      .map((step) => ({ ...step, targetIds: step.targetIds.filter((id) => !gone.has(id)) }))
      .filter((step) => step.targetIds.length > 0),
  };
}

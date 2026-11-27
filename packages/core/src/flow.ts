import { z } from 'zod';
import { arrowSchema } from './arrow';
import { blockSchema } from './blocks';
import { frameSchema } from './frame';
import { viewportSchema } from './geometry';
import { presentationStepSchema } from './presentation';

/** Versão do formato do fluxo. Mudou o formato? Suba o número e escreva a migração. */
export const FLOW_SCHEMA_VERSION = 1;

const flowContentShape = z.object({
  schemaVersion: z.literal(FLOW_SCHEMA_VERSION),
  blocks: z.array(blockSchema).default([]),
  frames: z.array(frameSchema).default([]),
  arrows: z.array(arrowSchema).default([]),
  /** Ordem da apresentação do modo aula: o item 0 é o passo 1. */
  presentation: z.array(presentationStepSchema).default([]),
  /** Última câmera usada, para reabrir o quadro no mesmo lugar. */
  viewport: viewportSchema.optional(),
});

type FlowContentShape = z.infer<typeof flowContentShape>;

/**
 * Regras que ligam as partes do fluxo. Garantem que o site, a API, a IA e o MCP
 * nunca gravem um fluxo que o quadro não sabe abrir.
 */
function checkReferences(flow: FlowContentShape, ctx: z.RefinementCtx): void {
  const issue = (message: string, path: (string | number)[]) =>
    ctx.addIssue({ code: 'custom', message, path });

  // Todo id é único no documento inteiro (blocos, molduras, setas e passos).
  const seen = new Set<string>();
  const claim = (id: string, path: (string | number)[]) => {
    if (seen.has(id)) issue(`id repetido: ${id}`, path);
    seen.add(id);
  };
  flow.blocks.forEach((block, i) => claim(block.id, ['blocks', i, 'id']));
  flow.frames.forEach((frame, i) => claim(frame.id, ['frames', i, 'id']));
  flow.arrows.forEach((arrow, i) => claim(arrow.id, ['arrows', i, 'id']));
  flow.presentation.forEach((step, i) => claim(step.id, ['presentation', i, 'id']));

  const frameIds = new Set(flow.frames.map((frame) => frame.id));
  const nodeIds = new Set([...flow.blocks.map((block) => block.id), ...frameIds]);

  flow.blocks.forEach((block, i) => {
    if (block.frameId !== undefined && !frameIds.has(block.frameId)) {
      issue(`moldura inexistente: ${block.frameId}`, ['blocks', i, 'frameId']);
    }
  });

  flow.arrows.forEach((arrow, i) => {
    for (const end of ['from', 'to'] as const) {
      if (!nodeIds.has(arrow[end].nodeId)) {
        issue(`a seta aponta para um nó inexistente: ${arrow[end].nodeId}`, [
          'arrows',
          i,
          end,
          'nodeId',
        ]);
      }
    }
  });

  const stepOf = new Map<string, number>();
  flow.presentation.forEach((step, i) => {
    step.targetIds.forEach((targetId, j) => {
      const path = ['presentation', i, 'targetIds', j];
      if (!nodeIds.has(targetId)) {
        issue(`o passo aponta para um nó inexistente: ${targetId}`, path);
      } else if (stepOf.has(targetId)) {
        issue(`o nó ${targetId} já está no passo ${String(stepOf.get(targetId))}`, path);
      } else {
        stepOf.set(targetId, i + 1);
      }
    });
  });
}

/** Conteúdo de um projeto do tipo fluxo: o que o quadro desenha. */
export const flowContentSchema = flowContentShape.superRefine(checkReferences);

export type FlowContent = z.infer<typeof flowContentSchema>;
export type FlowContentInput = z.input<typeof flowContentSchema>;

/** Fluxo vazio, como o modelo "Em branco". */
export function createEmptyFlow(): FlowContent {
  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    blocks: [],
    frames: [],
    arrows: [],
    presentation: [],
  };
}

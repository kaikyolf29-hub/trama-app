import { snapToGrid, type Arrow, type Block, type FlowContent, type Frame } from '@trama/core';
import { newId } from './create';

/** Cópias aparecem um pouco abaixo e à direita do original, na grade. */
export const DUPLICATE_OFFSET = 24;
/** Folga entre os blocos e a borda da moldura criada com Ctrl+G. */
const GROUP_PADDING = 32;

/**
 * Duplica blocos e molduras (Ctrl+D). Moldura vem com os blocos de dentro; setas entre nós
 * copiados também são copiadas. Devolve o fluxo novo e os ids das cópias.
 */
export function duplicateNodes(
  flow: FlowContent,
  ids: Iterable<string>,
  offset = DUPLICATE_OFFSET,
): { flow: FlowContent; copies: string[] } {
  const chosen = new Set(ids);
  const frames = flow.frames.filter((frame) => chosen.has(frame.id));
  const frameIds = new Set(frames.map((frame) => frame.id));
  // Um bloco entra se foi escolhido ou se a moldura dele foi.
  const blocks = flow.blocks.filter(
    (block) => chosen.has(block.id) || (block.frameId !== undefined && frameIds.has(block.frameId)),
  );
  if (frames.length === 0 && blocks.length === 0) return { flow, copies: [] };

  const idMap = new Map<string, string>();
  for (const node of [...frames, ...blocks]) idMap.set(node.id, newId());
  const move = (point: { x: number; y: number }) => ({
    x: snapToGrid(point.x + offset),
    y: snapToGrid(point.y + offset),
  });

  const newFrames: Frame[] = frames.map((frame) => ({
    ...frame,
    id: idMap.get(frame.id) ?? newId(),
    position: move(frame.position),
    locked: false,
  }));
  const newBlocks: Block[] = blocks.map((block) => {
    const copy: Block = {
      ...structuredClone(block),
      id: idMap.get(block.id) ?? newId(),
      position: move(block.position),
      locked: false,
    };
    // Na moldura copiada, se ela veio junto; senão, na mesma moldura do original.
    const frameId = block.frameId ? (idMap.get(block.frameId) ?? block.frameId) : undefined;
    if (frameId) return { ...copy, frameId };
    const { frameId: _none, ...rest } = copy;
    return rest;
  });
  // Etapas copiadas ganham ids novos para não repetir ids dentro da lista.
  const withFreshItems = newBlocks.map((block) =>
    block.type === 'checklist'
      ? { ...block, items: block.items.map((item) => ({ ...item, id: newId() })) }
      : block,
  );
  const newArrows: Arrow[] = flow.arrows
    .filter((arrow) => idMap.has(arrow.from.nodeId) && idMap.has(arrow.to.nodeId))
    .map((arrow) => ({
      ...arrow,
      id: newId(),
      from: { ...arrow.from, nodeId: idMap.get(arrow.from.nodeId) ?? arrow.from.nodeId },
      to: { ...arrow.to, nodeId: idMap.get(arrow.to.nodeId) ?? arrow.to.nodeId },
    }));

  return {
    flow: {
      ...flow,
      frames: [...flow.frames, ...newFrames],
      blocks: [...flow.blocks, ...withFreshItems],
      arrows: [...flow.arrows, ...newArrows],
    },
    copies: [...newFrames, ...withFreshItems].map((node) => node.id),
  };
}

/**
 * Agrupa blocos numa moldura nova (Ctrl+G), com folga em volta e o nome acima. Molduras não
 * se aninham: molduras na seleção ficam de fora. Devolve null sem blocos para agrupar.
 */
export function groupIntoFrame(
  flow: FlowContent,
  ids: Iterable<string>,
  frameId = newId(),
): { flow: FlowContent; frameId: string } | null {
  const chosen = new Set(ids);
  const blocks = flow.blocks.filter((block) => chosen.has(block.id));
  if (blocks.length === 0) return null;

  const left = Math.min(...blocks.map((b) => b.position.x));
  const top = Math.min(...blocks.map((b) => b.position.y));
  const right = Math.max(...blocks.map((b) => b.position.x + b.size.width));
  const bottom = Math.max(...blocks.map((b) => b.position.y + b.size.height));
  const position = {
    x: Math.floor((left - GROUP_PADDING) / 8) * 8,
    y: Math.floor((top - GROUP_PADDING) / 8) * 8,
  };
  const frame: Frame = {
    id: frameId,
    title: 'Nova seção',
    position,
    size: {
      width: Math.ceil((right + GROUP_PADDING - position.x) / 8) * 8,
      height: Math.ceil((bottom + GROUP_PADDING - position.y) / 8) * 8,
    },
    locked: false,
    zIndex: 0,
  };
  return {
    frameId,
    flow: {
      ...flow,
      frames: [...flow.frames, frame],
      blocks: flow.blocks.map((block) => (chosen.has(block.id) ? { ...block, frameId } : block)),
    },
  };
}

/** Pilha de desfazer e refazer: guarda fotos do fluxo, até um limite. */
export class History {
  private past: FlowContent[] = [];
  private future: FlowContent[] = [];

  constructor(private readonly limit = 100) {}

  /** Guarda o estado de antes de uma mudança; uma mudança nova apaga o que dava para refazer. */
  record(before: FlowContent): void {
    this.past.push(before);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  undo(current: FlowContent): FlowContent | undefined {
    const previous = this.past.pop();
    if (previous) this.future.push(current);
    return previous;
  }

  redo(current: FlowContent): FlowContent | undefined {
    const next = this.future.pop();
    if (next) this.past.push(current);
    return next;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }
}

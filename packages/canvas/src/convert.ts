import type { Arrow, Block, FlowContent, Frame } from '@trama/core';
import { snapToGrid } from '@trama/core';
import type { Edge, Node } from '@xyflow/react';

/** Dados de um nó de bloco no React Flow. */
export type BlockNodeData = { kind: 'block'; block: Block };
/** Dados de um nó de moldura no React Flow. */
export type FrameNodeData = { kind: 'frame'; frame: Frame };

export type BlockNode = Node<BlockNodeData, 'block'>;
export type FrameNode = Node<FrameNodeData, 'frame'>;
export type CanvasNode = BlockNode | FrameNode;
export type CanvasEdge = Edge<{ arrow: Arrow }>;

/** Molduras ficam sempre atrás dos blocos. */
const FRAME_LAYER = -1000;

/**
 * Do formato do core (posições absolutas no quadro) para o React Flow, onde um bloco
 * dentro de moldura tem posição relativa à moldura (`parentId`). As molduras vêm antes
 * na lista, como o React Flow pede para pais e filhos.
 */
export function toReactFlow(flow: FlowContent): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const frames = new Map(flow.frames.map((frame) => [frame.id, frame]));

  const frameNodes: FrameNode[] = flow.frames.map((frame) => ({
    id: frame.id,
    type: 'frame',
    position: { ...frame.position },
    width: frame.size.width,
    height: frame.size.height,
    zIndex: FRAME_LAYER + frame.zIndex,
    draggable: !frame.locked,
    data: { kind: 'frame', frame },
  }));

  const blockNodes: BlockNode[] = flow.blocks.map((block) => {
    const parent = block.frameId ? frames.get(block.frameId) : undefined;
    const position = parent
      ? { x: block.position.x - parent.position.x, y: block.position.y - parent.position.y }
      : { ...block.position };
    return {
      id: block.id,
      type: 'block',
      position,
      ...(parent ? { parentId: parent.id } : {}),
      width: block.size.width,
      height: block.size.height,
      zIndex: block.zIndex,
      draggable: !block.locked,
      data: { kind: 'block', block },
    };
  });

  const edges: CanvasEdge[] = flow.arrows.map((arrow) => ({
    id: arrow.id,
    source: arrow.from.nodeId,
    target: arrow.to.nodeId,
    sourceHandle: arrow.from.side ?? null,
    targetHandle: arrow.to.side ?? null,
    type: arrow.route === 'straight' ? 'straight' : 'default',
    label: arrow.label,
    data: { arrow },
  }));

  return { nodes: [...frameNodes, ...blockNodes], edges };
}

/**
 * Do React Flow de volta para o core: posições absolutas, encaixadas na grade de 8 px.
 * O resto de cada bloco e moldura vem dos dados originais, sem perder nada.
 */
export function fromReactFlow(flow: FlowContent, nodes: CanvasNode[]): FlowContent {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const absolute = (node: CanvasNode): { x: number; y: number } => {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    const base = parent ? absolute(parent) : { x: 0, y: 0 };
    return { x: base.x + node.position.x, y: base.y + node.position.y };
  };
  const place = (id: string, fallback: { x: number; y: number }) => {
    const node = byId.get(id);
    if (!node) return fallback;
    const { x, y } = absolute(node);
    return { x: snapToGrid(x), y: snapToGrid(y) };
  };

  return {
    ...flow,
    frames: flow.frames.map((frame) => ({ ...frame, position: place(frame.id, frame.position) })),
    blocks: flow.blocks.map((block) => ({ ...block, position: place(block.id, block.position) })),
  };
}

import { ArrowEdge } from './arrow-edge';
import { BlockNode, FrameNode } from './nodes';

/** Tipos de nó do quadro, para o `nodeTypes` do React Flow. */
export const nodeTypes = { block: BlockNode, frame: FrameNode };

/** Tipos de aresta: toda seta do Trama usa o mesmo componente. */
export const edgeTypes = { arrow: ArrowEdge };

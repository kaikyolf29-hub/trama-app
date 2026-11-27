import type { Block, Frame } from '@trama/core';
import { createContext, useContext } from 'react';
import type { CanvasMedia } from './media';

/** O que um bloco ou moldura pode pedir ao quadro. */
export interface CanvasActions {
  /** O nó que está com o texto em edição (clique duplo), se houver. */
  editingId: string | null;
  startEditing: (id: string) => void;
  stopEditing: () => void;
  updateBlock: (next: Block) => void;
  updateFrame: (next: Frame) => void;
  /** Endereço para mostrar uma imagem guardada (veja `CanvasMedia`). */
  resolveImage: CanvasMedia['resolveImage'];
}

export const CanvasContext = createContext<CanvasActions | null>(null);

export function useCanvas(): CanvasActions {
  const canvas = useContext(CanvasContext);
  if (!canvas) throw new Error('useCanvas precisa estar dentro do FlowCanvas.');
  return canvas;
}

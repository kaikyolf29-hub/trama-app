import type { Arrow, Block, Frame } from '@trama/core';
import { createContext, useContext } from 'react';
import type { CanvasMedia } from './media';
import type { StepTarget } from './steps';

/** O que um bloco ou moldura pode pedir ao quadro. */
export interface CanvasActions {
  /** O nó que está com o texto em edição (clique duplo), se houver. */
  editingId: string | null;
  startEditing: (id: string) => void;
  stopEditing: () => void;
  updateBlock: (next: Block) => void;
  updateFrame: (next: Frame) => void;
  updateArrow: (next: Arrow) => void;
  /** Número do passo da aula em que o nó aparece. */
  stepOf: (id: string) => number | undefined;
  stepCount: number;
  setStep: (id: string, target: StepTarget) => void;
  removeNode: (id: string) => void;
  /** Endereço para mostrar uma imagem guardada (veja `CanvasMedia`). */
  resolveImage: CanvasMedia['resolveImage'];
}

export const CanvasContext = createContext<CanvasActions | null>(null);

export function useCanvas(): CanvasActions {
  const canvas = useContext(CanvasContext);
  if (!canvas) throw new Error('useCanvas precisa estar dentro do FlowCanvas.');
  return canvas;
}

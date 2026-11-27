import {
  blockSchema,
  frameSchema,
  snapToGrid,
  type Block,
  type Frame,
  type Point,
} from '@trama/core';

/** O que as ferramentas e os atalhos (T, C, N, R, F) criam no quadro. */
export type CreatableKind = 'text' | 'card' | 'sticky' | 'shape' | 'frame';

/** Tamanhos iniciais, na grade de 8 px (blocos do mesmo tipo, do mesmo tamanho). */
export const DEFAULT_SIZES: Record<CreatableKind, { width: number; height: number }> = {
  text: { width: 320, height: 56 },
  card: { width: 280, height: 144 },
  sticky: { width: 160, height: 152 },
  shape: { width: 160, height: 96 },
  frame: { width: 480, height: 320 },
};

export function newId(): string {
  return crypto.randomUUID();
}

/** Centraliza o bloco onde a pessoa clicou e encaixa o canto na grade. */
function placeAt(point: Point, kind: CreatableKind): Point {
  const { width, height } = DEFAULT_SIZES[kind];
  return { x: snapToGrid(point.x - width / 2), y: snapToGrid(point.y - height / 2) };
}

/** Cria um bloco vazio, já validado pelo contrato do core. */
export function createBlock(kind: Exclude<CreatableKind, 'frame'>, at: Point, id = newId()): Block {
  return blockSchema.parse({
    id,
    type: kind,
    position: placeAt(at, kind),
    size: DEFAULT_SIZES[kind],
  });
}

export function createFrame(at: Point, id = newId()): Frame {
  return frameSchema.parse({
    id,
    title: 'Nova seção',
    position: placeAt(at, 'frame'),
    size: DEFAULT_SIZES.frame,
  });
}

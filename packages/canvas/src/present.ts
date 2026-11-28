import type { Block, FlowContent, PresentationStep } from '@trama/core';

/** Retângulo no quadro (coordenadas absolutas). */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Como um nó aparece na apresentação:
 * - `free`: não está em nenhum passo, aparece sempre, como fundo;
 * - `past`: o passo já passou, fica visível e discreto;
 * - `current`: é do passo de agora, em destaque (`own`: o passo é dele; sem `own`, ele só
 *   acompanha a moldura e não ganha contorno próprio);
 * - `future`: o passo ainda não chegou. `placeholder` diz se vira um quadro tracejado
 *   ("Passo N · ainda oculto", como na tela 2) ou some de vez (bloco que só segue a moldura).
 */
export type NodeState =
  | { kind: 'free' }
  | { kind: 'past'; step: number; own: boolean }
  | { kind: 'current'; step: number; own: boolean }
  | { kind: 'future'; step: number; placeholder: boolean };

/** O passo (começando em 0) de cada nó: o próprio, ou o da moldura onde ele está. */
export function stepIndexes(
  flow: Pick<FlowContent, 'blocks'>,
  steps: readonly PresentationStep[],
): Map<string, { index: number; own: boolean }> {
  const result = new Map<string, { index: number; own: boolean }>();
  steps.forEach((step, index) => {
    for (const id of step.targetIds) result.set(id, { index, own: true });
  });
  // Quem está numa moldura de um passo aparece junto com ela, a não ser que tenha passo próprio.
  for (const block of flow.blocks) {
    const frame = block.frameId ? result.get(block.frameId) : undefined;
    if (frame && !result.has(block.id)) result.set(block.id, { index: frame.index, own: false });
  }
  return result;
}

/** O estado de cada bloco e moldura quando o passo `current` (começando em 0) está na tela. */
export function presentStates(flow: FlowContent, current: number): Map<string, NodeState> {
  const indexes = stepIndexes(flow, flow.presentation);
  const states = new Map<string, NodeState>();
  for (const id of [...flow.frames.map((f) => f.id), ...flow.blocks.map((b) => b.id)]) {
    const found = indexes.get(id);
    if (!found) states.set(id, { kind: 'free' });
    else if (found.index < current) {
      states.set(id, { kind: 'past', step: found.index + 1, own: found.own });
    } else if (found.index === current) {
      states.set(id, { kind: 'current', step: found.index + 1, own: found.own });
    } else states.set(id, { kind: 'future', step: found.index + 1, placeholder: found.own });
  }
  return states;
}

/** A seta só aparece quando os dois lados aparecem (nem oculto, nem quadro tracejado). */
export function arrowVisible(
  states: ReadonlyMap<string, NodeState>,
  from: string,
  to: string,
): boolean {
  const shown = (id: string) => states.get(id)?.kind !== 'future';
  return shown(from) && shown(to);
}

/** A seta fica discreta quando um dos lados é de um passo que já passou. */
export function arrowDimmed(
  states: ReadonlyMap<string, NodeState>,
  from: string,
  to: string,
): boolean {
  return states.get(from)?.kind === 'past' || states.get(to)?.kind === 'past';
}

function boundsOf(rects: readonly Bounds[]): Bounds | null {
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((r) => r.x));
  const top = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function rectOf(flow: FlowContent, id: string): Bounds | null {
  const frame = flow.frames.find((f) => f.id === id);
  if (frame) return { ...frame.position, ...frame.size };
  const block = flow.blocks.find((b) => b.id === id);
  return block ? { ...block.position, ...block.size } : null;
}

/** O retângulo que a câmera precisa enquadrar para o passo (começando em 0). */
export function stepBounds(flow: FlowContent, step: number): Bounds | null {
  const target = flow.presentation[step];
  if (!target) return null;
  const rects = target.targetIds
    .map((id) => rectOf(flow, id))
    .filter((rect): rect is Bounds => rect !== null);
  return boundsOf(rects);
}

/** O retângulo do quadro inteiro (para apresentar sem passos). */
export function boardBounds(flow: FlowContent): Bounds | null {
  return boundsOf([
    ...flow.frames.map((f) => ({ ...f.position, ...f.size })),
    ...flow.blocks.map((b) => ({ ...b.position, ...b.size })),
  ]);
}

export interface CameraOptions {
  /** Folga em px, na tela, em volta do que a câmera enquadra (deixa lugar para os controles). */
  padding: { top: number; right: number; bottom: number; left: number };
  minZoom: number;
  maxZoom: number;
}

/** A câmera (`x`, `y`, `zoom` do React Flow) que enquadra `bounds` no meio da tela. */
export function cameraFor(
  bounds: Bounds,
  screen: { width: number; height: number },
  { padding, minZoom, maxZoom }: CameraOptions,
): { x: number; y: number; zoom: number } {
  const room = {
    width: Math.max(screen.width - padding.left - padding.right, 1),
    height: Math.max(screen.height - padding.top - padding.bottom, 1),
  };
  const fit = Math.min(
    room.width / Math.max(bounds.width, 1),
    room.height / Math.max(bounds.height, 1),
  );
  const zoom = Math.min(Math.max(fit, minZoom), maxZoom);
  return {
    x: padding.left + (room.width - bounds.width * zoom) / 2 - bounds.x * zoom,
    y: padding.top + (room.height - bounds.height * zoom) / 2 - bounds.y * zoom,
    zoom,
  };
}

/** Mantém o passo entre 0 e `count - 1`. */
export function clampStep(step: number, count: number): number {
  return Math.min(Math.max(step, 0), Math.max(count - 1, 0));
}

const NAME_LIMIT = 40;

function firstLine(text: string): string {
  const line = text
    .split('\n')
    .map((l) => l.replace(/^(-|\d+\.)\s+/, '').trim())
    .find((l) => l !== '');
  return line ?? '';
}

function shorten(text: string): string {
  return text.length > NAME_LIMIT ? `${text.slice(0, NAME_LIMIT - 1).trimEnd()}…` : text;
}

function blockName(block: Block): string {
  switch (block.type) {
    case 'text':
      return firstLine(block.text) || 'Texto';
    case 'card':
      return block.title.trim() || 'Cartão';
    case 'sticky':
      return firstLine(block.text) || 'Nota adesiva';
    case 'shape':
      return firstLine(block.text) || 'Forma';
    case 'image':
      return block.caption?.trim() || block.fileName || 'Imagem';
    case 'link': {
      if (block.title?.trim()) return block.title.trim();
      try {
        return new URL(block.url).hostname.replace(/^www\./, '');
      } catch {
        return 'Link';
      }
    }
    case 'checklist':
      return block.title.trim() || 'Etapas';
    case 'audio':
      return 'Áudio';
  }
}

/** O nome do nó na lista de passos: título da moldura, ou o texto principal do bloco. */
export function nodeName(flow: FlowContent, id: string): string | null {
  const frame = flow.frames.find((f) => f.id === id);
  if (frame) return shorten(frame.title.trim() || 'Moldura sem nome');
  const block = flow.blocks.find((b) => b.id === id);
  return block ? shorten(blockName(block)) : null;
}

/** O nome do passo: o título dele ou, sem título, o nome dos nós (os dois primeiros e "+N"). */
export function stepName(flow: FlowContent, step: PresentationStep): string {
  if (step.title?.trim()) return step.title.trim();
  const names = step.targetIds
    .map((id) => nodeName(flow, id))
    .filter((name): name is string => name !== null);
  if (names.length === 0) return 'Passo sem blocos';
  const shown = names.slice(0, 2).join(', ');
  return names.length > 2 ? `${shown} +${names.length - 2}` : shown;
}

/**
 * A etiqueta acima do nó que tem passo próprio, como na tela 2: "Passo 1" nos que já passaram e
 * "Passo 2 · agora" no de agora. Quem só acompanha a moldura não tem etiqueta.
 */
export function stepTag(state: NodeState): string | null {
  if (state.kind === 'current' && state.own) return `Passo ${state.step} · agora`;
  if (state.kind === 'past' && state.own) return `Passo ${state.step}`;
  return null;
}

/**
 * Quem leva a etiqueta de cada passo: só um nó por passo, o mais alto (e, empatado, o mais à
 * esquerda), para a etiqueta não se repetir nem cobrir o bloco de cima.
 */
export function stepTagHolders(flow: FlowContent): Set<string> {
  const holders = new Set<string>();
  for (const step of flow.presentation) {
    let best: { id: string; rect: Bounds } | null = null;
    for (const id of step.targetIds) {
      const rect = rectOf(flow, id);
      if (!rect) continue;
      if (!best || rect.y < best.rect.y || (rect.y === best.rect.y && rect.x < best.rect.x)) {
        best = { id, rect };
      }
    }
    if (best) holders.add(best.id);
  }
  return holders;
}

import type { AiBlock, AiFlowOutput } from './ai';
import type { Block, TextColor } from './blocks';
import { flowContentSchema, FLOW_SCHEMA_VERSION, type FlowContent } from './flow';
import type { Frame } from './frame';
import { GRID_SIZE } from './geometry';
import type { Arrow } from './arrow';
import {
  arrowSides,
  layoutFrame,
  layoutNodes,
  type LayoutEdge,
  type LayoutNode,
} from './ai-layout';

/**
 * Da saída da IA para um fluxo (etapas 3.1 e 3.3). A IA não escolhe posição: o layout automático
 * (`ai-layout.ts`) põe cada bloco, moldura e seta no lugar, em grade de 8 px e sem sobreposição.
 * O resultado já é um fluxo válido, que o quadro abre. Aqui ficam o tamanho de cada tipo de bloco
 * e a montagem; a conta das posições é do layout.
 */

export interface AiFlowOptions {
  /** Gera o id de cada bloco, moldura, seta e etapa. Os testes trocam por um contador. */
  newId?: () => string;
}

const MAX_HEIGHT = 480;

const ceilToGrid = (value: number) => Math.ceil(value / GRID_SIZE) * GRID_SIZE;

/** Corta o texto no limite do esquema, sem partir um par de substitutos (emoji, por exemplo). */
export function clipText(text: string, max: number): string {
  if (text.length <= max) return text;
  let end = max - 1;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return `${text.slice(0, end).trimEnd()}…`;
}

/** Quantas linhas o texto ocupa, contando quebras e linhas compridas que dobram. */
function lineCount(text: string, charsPerLine: number): number {
  return text
    .split('\n')
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
}

interface Sized {
  block: Block;
  width: number;
  height: number;
}

/** Monta o bloco (sem posição) e o tamanho provisório, pelo tamanho do texto. */
function toBlock(source: AiBlock, id: string, newId: () => string, frameId?: string): Sized {
  const base = { id, position: { x: 0, y: 0 }, locked: false, zIndex: 0, frameId } as const;
  switch (source.type) {
    case 'text': {
      const title = source.style === 'title';
      const fontSize = title ? 24 : 16;
      const lines = lineCount(source.text, Math.floor(288 / (fontSize * 0.55)));
      const size = {
        width: 320,
        height: Math.min(MAX_HEIGHT, Math.max(56, ceilToGrid(lines * (title ? 32 : 24) + 16))),
      };
      return {
        width: size.width,
        height: size.height,
        block: {
          ...base,
          type: 'text',
          size,
          text: source.text,
          font: title ? 'serif' : 'sans',
          fontSize,
          color: source.color satisfies TextColor,
          bold: title,
          italic: false,
        },
      };
    }
    case 'card': {
      const title = clipText(source.title, 200);
      const description = source.description?.trim() || undefined;
      const tag = source.tag?.trim() ? clipText(source.tag.trim(), 40) : undefined;
      const lines =
        lineCount(title, 28) * 24 + (description ? lineCount(description, 40) * 20 + 8 : 0);
      const size = {
        width: 320,
        height: Math.min(MAX_HEIGHT, Math.max(144, ceilToGrid(40 + (tag ? 24 : 0) + lines))),
      };
      return {
        width: size.width,
        height: size.height,
        block: {
          ...base,
          type: 'card',
          size,
          title,
          ...(description ? { description } : {}),
          ...(tag ? { tag } : {}),
        },
      };
    }
    case 'sticky': {
      const size = {
        width: 192,
        height: Math.min(
          MAX_HEIGHT,
          Math.max(152, ceilToGrid(40 + lineCount(source.text, 22) * 20)),
        ),
      };
      return {
        width: size.width,
        height: size.height,
        block: { ...base, type: 'sticky', size, text: source.text, color: source.color },
      };
    }
    case 'shape': {
      const size = {
        width: 192,
        height: Math.min(
          MAX_HEIGHT,
          Math.max(112, ceilToGrid(48 + lineCount(source.text, 18) * 20)),
        ),
      };
      return {
        width: size.width,
        height: size.height,
        block: { ...base, type: 'shape', size, shape: source.shape, text: source.text },
      };
    }
    case 'checklist': {
      const size = {
        width: 256,
        height: Math.min(MAX_HEIGHT, ceilToGrid(72 + Math.max(1, source.items.length) * 32)),
      };
      return {
        width: size.width,
        height: size.height,
        block: {
          ...base,
          type: 'checklist',
          size,
          title: clipText(source.title, 80),
          items: source.items.map((text) => ({
            id: newId(),
            text: clipText(text, 500),
            done: false,
          })),
        },
      };
    }
  }
}

/**
 * Converte a saída validada da IA em um fluxo. As posições são provisórias (veja o alto do
 * arquivo); o texto longo demais para o esquema é cortado, e ligações de um nó para ele mesmo
 * ou repetidas são descartadas. As correções não entram no fluxo: a tela as mostra à parte.
 */
export function aiOutputToFlow(output: AiFlowOutput, options: AiFlowOptions = {}): FlowContent {
  const newId = options.newId ?? (() => crypto.randomUUID());

  const nodeIds = new Map<string, string>();
  const groupOf = new Map<string, string>();
  for (const group of output.groups) {
    nodeIds.set(group.ref, newId());
    for (const ref of group.blockRefs) groupOf.set(ref, group.ref);
  }
  const sized = output.blocks.map((source) => {
    const id = newId();
    nodeIds.set(source.ref, id);
    const group = groupOf.get(source.ref);
    return { source, group, ...toBlock(source, id, newId, group ? nodeIds.get(group) : undefined) };
  });

  // O que o layout enxerga: blocos soltos e grupos (que viram molduras) no primeiro nível, na
  // ordem em que aparecem; os blocos de um grupo, por dentro dele.
  const topOf = (ref: string) => groupOf.get(ref) ?? ref;
  const members = new Map<string, typeof sized>();
  for (const item of sized) {
    if (item.group !== undefined) {
      members.set(item.group, [...(members.get(item.group) ?? []), item]);
    }
  }
  const frameLayouts = new Map<string, ReturnType<typeof layoutFrame>>();
  for (const [group, items] of members) {
    const inside = new Set(items.map((item) => item.source.ref));
    const edges: LayoutEdge[] = output.links
      .filter((link) => inside.has(link.from) && inside.has(link.to))
      .map((link) => [nodeIds.get(link.from)!, nodeIds.get(link.to)!]);
    const nodes: LayoutNode[] = items.map((item) => ({
      id: nodeIds.get(item.source.ref)!,
      width: item.width,
      height: item.height,
    }));
    frameLayouts.set(group, layoutFrame(nodes, edges));
  }

  const top: LayoutNode[] = [];
  const seenTop = new Set<string>();
  for (const item of sized) {
    const ref = topOf(item.source.ref);
    if (seenTop.has(ref)) continue;
    seenTop.add(ref);
    const frame = frameLayouts.get(ref);
    const loose = sized.find((other) => other.source.ref === ref);
    top.push({
      id: nodeIds.get(ref)!,
      width: frame ? frame.width : loose!.width,
      height: frame ? frame.height : loose!.height,
    });
  }
  const topEdges: LayoutEdge[] = output.links.map((link) => [
    nodeIds.get(topOf(link.from))!,
    nodeIds.get(topOf(link.to))!,
  ]);
  const placed = layoutNodes(top, topEdges);

  const blocks: Block[] = [];
  const frames: Frame[] = [];
  const boxes = new Map<string, { x: number; y: number; width: number; height: number }>();
  const box = (
    id: string,
    point: { x: number; y: number },
    size: { width: number; height: number },
  ) => boxes.set(id, { ...point, width: size.width, height: size.height });

  for (const group of output.groups) {
    const layout = frameLayouts.get(group.ref);
    if (!layout) continue;
    const id = nodeIds.get(group.ref)!;
    const origin = placed.positions.get(id)!;
    frames.push({
      id,
      title: clipText(group.title, 120),
      position: origin,
      size: { width: layout.width, height: layout.height },
      locked: false,
      zIndex: 0,
    });
    box(id, origin, layout);
    for (const item of members.get(group.ref) ?? []) {
      const offset = layout.inner.get(item.block.id)!;
      const position = { x: origin.x + offset.x, y: origin.y + offset.y };
      blocks.push({ ...item.block, position });
      box(item.block.id, position, item);
    }
  }
  for (const item of sized) {
    if (item.group !== undefined) continue;
    const position = placed.positions.get(item.block.id)!;
    blocks.push({ ...item.block, position });
    box(item.block.id, position, item);
  }
  // Na ordem da saída da IA (e não "molduras primeiro"), para o resultado ser previsível.
  const order = new Map(sized.map((item, i) => [item.block.id, i]));
  blocks.sort((a, b) => order.get(a.id)! - order.get(b.id)!);

  const arrows: Arrow[] = [];
  const seen = new Set<string>();
  for (const link of output.links) {
    const from = nodeIds.get(link.from)!;
    const to = nodeIds.get(link.to)!;
    const key = `${from}>${to}`;
    if (from === to || seen.has(key)) continue;
    seen.add(key);
    const label = link.label?.trim();
    const sides = arrowSides(boxes.get(from)!, boxes.get(to)!);
    arrows.push({
      id: newId(),
      from: { nodeId: from, ...(sides ? { side: sides.from } : {}) },
      to: { nodeId: to, ...(sides ? { side: sides.to } : {}) },
      route: 'curved',
      ...(label ? { label: clipText(label, 200) } : {}),
    });
  }

  return flowContentSchema.parse({
    schemaVersion: FLOW_SCHEMA_VERSION,
    blocks,
    frames,
    arrows,
    presentation: [],
  });
}

/** O título que a IA sugeriu, no limite de um título de projeto (ou "Sem título"). */
export function aiSuggestedTitle(title: string): string {
  const clean = title.trim();
  return clean ? clipText(clean, 200) : 'Sem título';
}

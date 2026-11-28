import type { AiBlock, AiFlowOutput } from './ai';
import type { Block, TextColor } from './blocks';
import { flowContentSchema, FLOW_SCHEMA_VERSION, type FlowContent } from './flow';
import type { Frame } from './frame';
import { GRID_SIZE } from './geometry';
import type { Arrow } from './arrow';

/**
 * Da saída da IA para um fluxo (etapa 3.1). A IA não escolhe posição: o layout automático que
 * posiciona os blocos de verdade é da etapa 3.3. Aqui as posições são provisórias, em grade de
 * 8 px: o que não está em grupo vem primeiro, em linhas de até três colunas; cada grupo vira
 * uma moldura logo abaixo, com os blocos dentro. O resultado já é um fluxo válido, que o quadro
 * abre.
 */

export interface AiFlowOptions {
  /** Gera o id de cada bloco, moldura, seta e etapa. Os testes trocam por um contador. */
  newId?: () => string;
  /** Se passado, recebe o id de cada bloco e grupo da saída, pelo nome (`ref`) que ela deu. */
  refIds?: Map<string, string>;
}

/** Espaço entre blocos, margem dentro da moldura e altura do título dela (múltiplos de 8). */
const GAP = 32;
const FRAME_PADDING = 32;
const FRAME_HEADER = 56;
const SECTION_GAP = 64;
/** Largura máxima de uma linha de blocos: três cartões e o espaço entre eles. */
const ROW_MAX_WIDTH = 3 * 320 + 2 * GAP;
const FRAME_MIN_WIDTH = 320;
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
        height: Math.min(MAX_HEIGHT, ceilToGrid(lines * (title ? 32 : 24) + 16)),
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
        height: Math.min(MAX_HEIGHT, Math.max(96, ceilToGrid(40 + (tag ? 24 : 0) + lines))),
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
          Math.max(120, ceilToGrid(40 + lineCount(source.text, 22) * 20)),
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
        height: Math.min(MAX_HEIGHT, ceilToGrid(72 + source.items.length * 32)),
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

interface Placed {
  /** Posição de cada item em relação ao canto de cima, à esquerda, da área. */
  offsets: { x: number; y: number }[];
  width: number;
  height: number;
}

/** Enfileira os blocos da esquerda para a direita, pulando de linha quando passa da largura. */
function packRows(items: readonly { width: number; height: number }[]): Placed {
  const offsets: { x: number; y: number }[] = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  let width = 0;
  for (const item of items) {
    if (x > 0 && x + item.width > ROW_MAX_WIDTH) {
      x = 0;
      y += rowHeight + GAP;
      rowHeight = 0;
    }
    offsets.push({ x, y });
    x += item.width + GAP;
    width = Math.max(width, x - GAP);
    rowHeight = Math.max(rowHeight, item.height);
  }
  return { offsets, width, height: y + rowHeight };
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

  const blocks: Block[] = [];
  const frames: Frame[] = [];
  let y = 0;

  const loose = sized.filter((item) => item.group === undefined);
  if (loose.length > 0) {
    const placed = packRows(loose);
    loose.forEach((item, i) => {
      const offset = placed.offsets[i]!;
      blocks.push({ ...item.block, position: { x: offset.x, y: y + offset.y } });
    });
    y += placed.height + SECTION_GAP;
  }

  for (const group of output.groups) {
    const members = sized.filter((item) => item.group === group.ref);
    if (members.length === 0) continue;
    const placed = packRows(members);
    const width = Math.max(FRAME_MIN_WIDTH, placed.width + 2 * FRAME_PADDING);
    const height = placed.height + FRAME_PADDING + FRAME_HEADER;
    frames.push({
      id: nodeIds.get(group.ref)!,
      title: clipText(group.title, 120),
      position: { x: 0, y },
      size: { width, height },
      locked: false,
      zIndex: 0,
    });
    members.forEach((item, i) => {
      const offset = placed.offsets[i]!;
      blocks.push({
        ...item.block,
        position: { x: FRAME_PADDING + offset.x, y: y + FRAME_HEADER + offset.y },
      });
    });
    y += height + SECTION_GAP;
  }

  const arrows: Arrow[] = [];
  const seen = new Set<string>();
  for (const link of output.links) {
    const from = nodeIds.get(link.from)!;
    const to = nodeIds.get(link.to)!;
    const key = `${from}>${to}`;
    if (from === to || seen.has(key)) continue;
    seen.add(key);
    const label = link.label?.trim();
    arrows.push({
      id: newId(),
      from: { nodeId: from },
      to: { nodeId: to },
      route: 'curved',
      ...(label ? { label: clipText(label, 200) } : {}),
    });
  }

  if (options.refIds) for (const [ref, id] of nodeIds) options.refIds.set(ref, id);

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

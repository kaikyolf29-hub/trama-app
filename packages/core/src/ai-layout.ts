import type { AnchorSide } from './arrow';
import { flowContentSchema, type FlowContent } from './flow';
import { GRID_SIZE, snapToGrid, type Point } from './geometry';

/**
 * Layout automático (etapa 3.3): funções puras que posicionam os nós da saída da IA no quadro.
 * Tudo em múltiplos de 8 px, sem sobreposição, lendo da esquerda para a direita e de cima para
 * baixo:
 *
 * - quem tem ligação vai em colunas, uma por "camada" (a coluna de um nó fica depois da de
 *   todos os que apontam para ele); camadas que não cabem na largura passam para a faixa de baixo;
 * - quem não tem ligação nenhuma vem depois, em linhas, como uma grade;
 * - um grupo é uma moldura que envolve os blocos dele, que seguem a mesma regra por dentro.
 *
 * Nada aqui conhece React Flow nem mede texto: o tamanho de cada nó chega pronto.
 */

/** Espaço entre colunas (onde passam as setas), entre linhas e entre faixas. */
export const LAYOUT_COLUMN_GAP = 64;
export const LAYOUT_ROW_GAP = 32;
export const LAYOUT_BAND_GAP = 64;
/** Margem dentro da moldura e altura do título dela. */
export const FRAME_PADDING = 32;
export const FRAME_HEADER = 56;
/** Largura mínima de uma moldura. */
export const FRAME_MIN_WIDTH = 320;
/** Largura de uma faixa de colunas no quadro; passou disso, a camada seguinte vai para baixo. */
export const LAYOUT_MAX_WIDTH = 1792;
/** Largura de uma faixa por dentro de uma moldura: três cartões de 320 px e o espaço entre eles. */
export const LAYOUT_FRAME_INNER_MAX_WIDTH = 3 * 320 + 2 * LAYOUT_COLUMN_GAP;
/** Altura máxima de uma coluna; passou disso, ela se divide em mais de uma. */
export const LAYOUT_MAX_COLUMN_HEIGHT = 1280;

export interface LayoutNode {
  id: string;
  width: number;
  height: number;
}

/** Ligação entre dois nós, pelos ids (a direção importa: `from` fica antes de `to`). */
export type LayoutEdge = readonly [from: string, to: string];

export interface LayoutResult {
  /** Canto de cima, à esquerda, de cada nó, em relação ao canto da área. */
  positions: Map<string, Point>;
  /** Tamanho da área que os nós ocupam (do canto 0,0 até o último nó). */
  width: number;
  height: number;
}

export interface LayoutOptions {
  /** Largura de uma faixa de colunas (padrão: `LAYOUT_MAX_WIDTH`). */
  maxWidth?: number;
  /** Altura máxima de uma coluna (padrão: `LAYOUT_MAX_COLUMN_HEIGHT`). */
  maxColumnHeight?: number;
}

const ceilToGrid = (value: number) => Math.ceil(value / GRID_SIZE) * GRID_SIZE;

/** Tira ligações repetidas, de um nó para ele mesmo e para nós que não existem. */
function cleanEdges(
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[],
): [number, number][] {
  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const seen = new Set<string>();
  const clean: [number, number][] = [];
  for (const [from, to] of edges) {
    const a = index.get(from);
    const b = index.get(to);
    if (a === undefined || b === undefined || a === b) continue;
    const key = `${a}>${b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push([a, b]);
  }
  return clean;
}

/** Solta as ligações que fecham um ciclo (volta para um nó que ainda está sendo visitado). */
function withoutCycles(count: number, edges: readonly [number, number][]): [number, number][] {
  const next: number[][] = Array.from({ length: count }, () => []);
  for (const [a, b] of edges) next[a]!.push(b);
  const state = new Uint8Array(count); // 0 = não visto, 1 = na pilha, 2 = pronto
  const dropped = new Set<string>();
  const visit = (start: number) => {
    // Visita sem recursão, para um fluxo comprido não estourar a pilha.
    const stack: { node: number; child: number }[] = [{ node: start, child: 0 }];
    state[start] = 1;
    while (stack.length > 0) {
      const top = stack[stack.length - 1]!;
      const children = next[top.node]!;
      if (top.child >= children.length) {
        state[top.node] = 2;
        stack.pop();
        continue;
      }
      const child = children[top.child]!;
      top.child += 1;
      if (state[child] === 1) dropped.add(`${top.node}>${child}`);
      else if (state[child] === 0) {
        state[child] = 1;
        stack.push({ node: child, child: 0 });
      }
    }
  };
  for (let i = 0; i < count; i += 1) if (state[i] === 0) visit(i);
  return edges.filter(([a, b]) => !dropped.has(`${a}>${b}`));
}

/** Enfileira os nós da esquerda para a direita, pulando de linha quando passa da largura. */
function packRows(
  nodes: readonly LayoutNode[],
  maxWidth: number,
): { offsets: Point[]; width: number; height: number } {
  const offsets: Point[] = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  let width = 0;
  for (const node of nodes) {
    if (x > 0 && x + node.width > maxWidth) {
      x = 0;
      y += rowHeight + LAYOUT_ROW_GAP;
      rowHeight = 0;
    }
    offsets.push({ x, y });
    x += node.width + LAYOUT_COLUMN_GAP;
    width = Math.max(width, x - LAYOUT_COLUMN_GAP);
    rowHeight = Math.max(rowHeight, node.height);
  }
  return { offsets, width, height: nodes.length === 0 ? 0 : y + rowHeight };
}

/** A camada de cada nó (a mais longa cadeia de quem aponta para ele) e a ordem dentro dela. */
function layersOf(count: number, edges: readonly [number, number][]): number[][] {
  const preds: number[][] = Array.from({ length: count }, () => []);
  const succs: number[][] = Array.from({ length: count }, () => []);
  const inDegree = new Array<number>(count).fill(0);
  for (const [a, b] of edges) {
    preds[b]!.push(a);
    succs[a]!.push(b);
    inDegree[b]! += 1;
  }
  const layer = new Array<number>(count).fill(0);
  const queue: number[] = [];
  for (let i = 0; i < count; i += 1) if (inDegree[i] === 0) queue.push(i);
  for (let head = 0; head < queue.length; head += 1) {
    const node = queue[head]!;
    for (const child of succs[node]!) {
      layer[child] = Math.max(layer[child]!, layer[node]! + 1);
      inDegree[child]! -= 1;
      if (inDegree[child] === 0) queue.push(child);
    }
  }
  const depth = Math.max(...layer, 0);
  const layers: number[][] = Array.from({ length: depth + 1 }, () => []);
  // A primeira camada segue a ordem original; as seguintes, a média da posição de quem aponta
  // para o nó (menos setas se cruzando), com a ordem original para desempatar.
  const row = new Array<number>(count).fill(0);
  const byLayer = Array.from({ length: depth + 1 }, (_, l) =>
    queue.filter((node) => layer[node] === l).sort((a, b) => a - b),
  );
  byLayer.forEach((members, l) => {
    const keyed = members.map((node) => {
      const above = preds[node]!;
      const key =
        l === 0 || above.length === 0
          ? node
          : above.reduce((sum, p) => sum + row[p]!, 0) / above.length;
      return { node, key };
    });
    if (l > 0) keyed.sort((a, b) => a.key - b.key || a.node - b.node);
    keyed.forEach(({ node }, i) => {
      row[node] = i;
      layers[l]!.push(node);
    });
  });
  return layers;
}

/**
 * Posiciona os nós. `edges` diz quem vem antes de quem. Não há sobreposição: cada coluna empilha
 * os nós com espaço entre eles, cada faixa fica abaixo da anterior, e os nós sem ligação
 * ocupam as últimas linhas.
 */
export function layoutNodes(
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[],
  options: LayoutOptions = {},
): LayoutResult {
  const maxWidth = options.maxWidth ?? LAYOUT_MAX_WIDTH;
  const maxColumnHeight = options.maxColumnHeight ?? LAYOUT_MAX_COLUMN_HEIGHT;
  const positions = new Map<string, Point>();
  if (nodes.length === 0) return { positions, width: 0, height: 0 };

  const all = cleanEdges(nodes, edges);
  const linked = new Set<number>();
  for (const [a, b] of all) {
    linked.add(a);
    linked.add(b);
  }
  const connected = nodes.map((_, i) => i).filter((i) => linked.has(i));
  const loose = nodes.map((_, i) => i).filter((i) => !linked.has(i));

  let width = 0;
  let y = 0;

  if (connected.length > 0) {
    // Renumera só os nós ligados, mantendo a ordem original.
    const local = new Map(connected.map((original, i) => [original, i]));
    const dag = withoutCycles(
      connected.length,
      all.map(([a, b]) => [local.get(a)!, local.get(b)!] as [number, number]),
    );
    const layers = layersOf(connected.length, dag);

    // Cada camada vira uma ou mais colunas (se ficar alta demais, divide).
    const columns: number[][] = [];
    for (const layer of layers) {
      let column: number[] = [];
      let height = 0;
      for (const l of layer) {
        const node = nodes[connected[l]!]!;
        if (column.length > 0 && height + LAYOUT_ROW_GAP + node.height > maxColumnHeight) {
          columns.push(column);
          column = [];
          height = 0;
        }
        height += (column.length > 0 ? LAYOUT_ROW_GAP : 0) + node.height;
        column.push(connected[l]!);
      }
      if (column.length > 0) columns.push(column);
    }

    // As colunas vão em faixas: passou da largura, a próxima coluna começa na faixa de baixo.
    let x = 0;
    let bandHeight = 0;
    for (const column of columns) {
      const columnWidth = Math.max(...column.map((i) => nodes[i]!.width));
      if (x > 0 && x + columnWidth > maxWidth) {
        y += bandHeight + LAYOUT_BAND_GAP;
        x = 0;
        bandHeight = 0;
      }
      let top = y;
      for (const i of column) {
        const node = nodes[i]!;
        positions.set(node.id, { x, y: top });
        top += node.height + LAYOUT_ROW_GAP;
      }
      bandHeight = Math.max(bandHeight, top - LAYOUT_ROW_GAP - y);
      width = Math.max(width, x + columnWidth);
      x += columnWidth + LAYOUT_COLUMN_GAP;
    }
    y += bandHeight;
  }

  if (loose.length > 0) {
    if (connected.length > 0) y += LAYOUT_BAND_GAP;
    const rows = packRows(
      loose.map((i) => nodes[i]!),
      Math.max(
        maxWidth > LAYOUT_FRAME_INNER_MAX_WIDTH ? LAYOUT_FRAME_INNER_MAX_WIDTH : maxWidth,
        width,
      ),
    );
    loose.forEach((i, k) => {
      const offset = rows.offsets[k]!;
      positions.set(nodes[i]!.id, { x: offset.x, y: y + offset.y });
    });
    width = Math.max(width, rows.width);
    y += rows.height;
  }

  return { positions, width, height: y };
}

/** Tamanho e posição dos blocos dentro de uma moldura, e o tamanho dela. */
export interface FrameLayout {
  /** Posição de cada bloco em relação ao canto da moldura. */
  inner: Map<string, Point>;
  width: number;
  height: number;
}

/** Arruma os blocos de um grupo por dentro e devolve o tamanho da moldura que os envolve. */
export function layoutFrame(
  members: readonly LayoutNode[],
  edges: readonly LayoutEdge[],
): FrameLayout {
  const layout = layoutNodes(members, edges, { maxWidth: LAYOUT_FRAME_INNER_MAX_WIDTH });
  const inner = new Map<string, Point>();
  for (const [id, point] of layout.positions) {
    inner.set(id, { x: FRAME_PADDING + point.x, y: FRAME_HEADER + point.y });
  }
  return {
    inner,
    width: Math.max(FRAME_MIN_WIDTH, ceilToGrid(layout.width + 2 * FRAME_PADDING)),
    height: ceilToGrid(layout.height + FRAME_HEADER + FRAME_PADDING),
  };
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * De que lado de cada nó a seta sai e chega: para a direita quando o destino está depois, para
 * baixo quando está abaixo, e assim por diante. Sempre no meio da borda, como o quadro desenha.
 */
export function arrowSides(from: Box, to: Box): { from: AnchorSide; to: AnchorSide } | null {
  if (to.x >= from.x + from.width) return { from: 'right', to: 'left' };
  if (to.x + to.width <= from.x) return { from: 'left', to: 'right' };
  if (to.y >= from.y + from.height) return { from: 'bottom', to: 'top' };
  if (to.y + to.height <= from.y) return { from: 'top', to: 'bottom' };
  // Um dentro do outro (grupo e bloco dele): o quadro escolhe o lado mais próximo.
  return null;
}

/** O retângulo que cobre todos os blocos e molduras (ou `null`, se o fluxo está vazio). */
export function flowBounds(flow: Pick<FlowContent, 'blocks' | 'frames'>): Box | null {
  const boxes = [
    ...flow.blocks.map((block) => ({ ...block.position, ...block.size })),
    ...flow.frames.map((frame) => ({ ...frame.position, ...frame.size })),
  ];
  if (boxes.length === 0) return null;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Espaço entre o que já está no quadro e o que a IA acrescenta. */
export const APPEND_GAP = 96;

/**
 * Junta um fluxo novo (o que a IA montou) ao que já está no quadro, abaixo dele e alinhado à
 * esquerda, sem sobrepor nada. Quadro vazio: o fluxo novo entra como está. Os dois lados já
 * têm ids próprios (a IA gera `randomUUID`); id repetido faz o `flowContentSchema` recusar.
 * A câmera salva sai, para o quadro reabrir enquadrando tudo, inclusive o que chegou agora.
 */
export function appendFlowBelow(existing: FlowContent, added: FlowContent): FlowContent {
  const bounds = flowBounds(existing);
  const addedBounds = flowBounds(added);
  let dx = 0;
  let dy = 0;
  if (bounds && addedBounds) {
    dx = snapToGrid(bounds.x - addedBounds.x);
    dy = snapToGrid(bounds.y + bounds.height + APPEND_GAP - addedBounds.y);
    // Arredondar para a grade nunca pode empurrar o fluxo novo para cima do que já existe.
    if (addedBounds.y + dy < bounds.y + bounds.height + APPEND_GAP) dy += GRID_SIZE;
  }
  const move = (point: Point): Point => ({ x: point.x + dx, y: point.y + dy });
  const { viewport: _viewport, ...rest } = existing;
  return flowContentSchema.parse({
    ...rest,
    blocks: [
      ...existing.blocks,
      ...added.blocks.map((block) => ({ ...block, position: move(block.position) })),
    ],
    frames: [
      ...existing.frames,
      ...added.frames.map((frame) => ({ ...frame, position: move(frame.position) })),
    ],
    arrows: [...existing.arrows, ...added.arrows],
    presentation: existing.presentation,
  });
}

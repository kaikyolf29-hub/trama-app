import { describe, expect, it } from 'vitest';
import type { AiBlock, AiFlowOutput } from './ai';
import { aiOutputToFlow } from './ai-flow';
import {
  APPEND_GAP,
  LAYOUT_MAX_WIDTH,
  appendFlowBelow,
  arrowSides,
  flowBounds,
  layoutNodes,
  type LayoutNode,
} from './ai-layout';
import { flowContentSchema, type FlowContent } from './flow';
import { snapToGrid } from './geometry';

/** Gerador de números repetível (mulberry32): os testes de propriedade usam sempre as mesmas sementes. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function counter() {
  let n = 0;
  return () => `id-${String(++n)}`;
}

const node = (id: string, width = 320, height = 144): LayoutNode => ({ id, width, height });

type Box = { x: number; y: number; width: number; height: number };

function apart(a: Box, b: Box): boolean {
  return (
    a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y
  );
}

describe('layoutNodes', () => {
  it('uma cadeia vai da esquerda para a direita, cada nó numa coluna', () => {
    const nodes = [node('a'), node('b'), node('c')];
    const { positions } = layoutNodes(nodes, [
      ['a', 'b'],
      ['b', 'c'],
    ]);
    expect(positions.get('a')).toEqual({ x: 0, y: 0 });
    expect(positions.get('b')).toEqual({ x: 384, y: 0 });
    expect(positions.get('c')).toEqual({ x: 768, y: 0 });
  });

  it('quem sai do mesmo nó fica na mesma coluna, um embaixo do outro', () => {
    const { positions } = layoutNodes(
      [node('raiz'), node('x'), node('y')],
      [
        ['raiz', 'x'],
        ['raiz', 'y'],
      ],
    );
    expect(positions.get('x')!.x).toBe(positions.get('y')!.x);
    expect(positions.get('y')!.y).toBeGreaterThan(positions.get('x')!.y);
  });

  it('a coluna de um nó fica depois da de todos os que apontam para ele', () => {
    // a -> b -> c e a -> c: c vai depois de b, não ao lado dele.
    const { positions } = layoutNodes(
      [node('a'), node('b'), node('c')],
      [
        ['a', 'b'],
        ['b', 'c'],
        ['a', 'c'],
      ],
    );
    expect(positions.get('c')!.x).toBeGreaterThan(positions.get('b')!.x);
  });

  it('ciclo e ligação inválida não travam nem somem com nós', () => {
    const nodes = [node('a'), node('b'), node('c')];
    const { positions } = layoutNodes(nodes, [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'a'],
      ['a', 'a'],
      ['a', 'nada'],
    ]);
    expect([...positions.keys()].sort()).toEqual(['a', 'b', 'c']);
  });

  it('quem não tem ligação vem depois, em linhas', () => {
    const { positions, height } = layoutNodes(
      [node('a'), node('b'), node('s1'), node('s2')],
      [['a', 'b']],
    );
    const linkedBottom = Math.max(positions.get('a')!.y, positions.get('b')!.y) + 144;
    expect(positions.get('s1')!.y).toBeGreaterThan(linkedBottom);
    expect(positions.get('s2')!.y).toBe(positions.get('s1')!.y);
    expect(height).toBeGreaterThan(linkedBottom);
  });

  it('uma cadeia comprida passa para a faixa de baixo em vez de ir longe demais', () => {
    const nodes = Array.from({ length: 12 }, (_, i) => node(`n${String(i)}`));
    const edges = nodes.slice(1).map((n, i) => [nodes[i]!.id, n.id] as const);
    const { positions, width } = layoutNodes(nodes, edges);
    expect(width).toBeLessThanOrEqual(LAYOUT_MAX_WIDTH);
    const rows = new Set([...positions.values()].map((p) => p.y));
    expect(rows.size).toBeGreaterThan(1);
    // Lendo a página: cada nó vem depois do anterior, na mesma faixa (à direita) ou numa abaixo.
    for (let i = 1; i < nodes.length; i += 1) {
      const before = positions.get(nodes[i - 1]!.id)!;
      const after = positions.get(nodes[i]!.id)!;
      expect(after.y > before.y || after.x > before.x).toBe(true);
    }
  });

  it('uma coluna muito alta se divide em duas', () => {
    const nodes = [node('raiz'), ...Array.from({ length: 12 }, (_, i) => node(`f${String(i)}`))];
    const edges = nodes.slice(1).map((n) => ['raiz', n.id] as const);
    const { positions } = layoutNodes(nodes, edges, { maxColumnHeight: 640 });
    expect(new Set(nodes.slice(1).map((n) => positions.get(n.id)!.x)).size).toBeGreaterThan(1);
  });

  it('sem nós, devolve uma área vazia', () => {
    expect(layoutNodes([], [])).toEqual({ positions: new Map(), width: 0, height: 0 });
  });
});

/** Uma saída aleatória: blocos de todos os tipos, grupos, ligações (com ciclos, se `acyclic` for falso). */
function randomOutput(seed: number, acyclic: boolean): AiFlowOutput {
  const rnd = random(seed);
  const int = (max: number) => Math.floor(rnd() * max);
  const count = 1 + int(30);
  const text = () => 'palavra '.repeat(1 + int(25)).trim();
  const blocks: AiBlock[] = Array.from({ length: count }, (_, i): AiBlock => {
    const ref = `b${String(i)}`;
    switch (int(5)) {
      case 0:
        return {
          type: 'text',
          ref,
          text: text(),
          style: int(2) ? 'body' : 'title',
          color: 'normal',
        };
      case 1:
        return {
          type: 'card',
          ref,
          title: text(),
          description: int(2) ? text() : null,
          tag: int(2) ? 'Etapa' : null,
        };
      case 2:
        return { type: 'sticky', ref, text: text(), color: 'yellow' };
      case 3:
        return { type: 'shape', ref, shape: 'ellipse', text: text() };
      default:
        return {
          type: 'checklist',
          ref,
          title: 'Etapas',
          items: Array.from({ length: int(8) }, text),
        };
    }
  });
  const groupCount = int(Math.min(5, count));
  const groups = Array.from({ length: groupCount }, (_, g) => ({
    ref: `g${String(g)}`,
    title: `Grupo ${String(g)}`,
    blockRefs: [] as string[],
  }));
  if (groups.length > 0) {
    for (const block of blocks) {
      const g = int(groups.length + 1);
      if (g < groups.length) groups[g]!.blockRefs.push(block.ref);
    }
  }
  const filled = groups.filter((g) => g.blockRefs.length > 0);
  const refs = [...blocks.map((b) => b.ref), ...filled.map((g) => g.ref)];
  // Sem ciclos: a ordem é a do primeiro nível (blocos soltos e grupos, na ordem em que aparecem),
  // e uma ligação só vai de um nó para outro igual ou mais adiante.
  const groupOf = new Map(filled.flatMap((g) => g.blockRefs.map((ref) => [ref, g.ref] as const)));
  const topOrder: string[] = [];
  for (const block of blocks) {
    const top = groupOf.get(block.ref) ?? block.ref;
    if (!topOrder.includes(top)) topOrder.push(top);
  }
  const key = (ref: string) => {
    const top = groupOf.get(ref) ?? ref;
    return topOrder.indexOf(top) * 1000 + refs.indexOf(ref);
  };
  const links = Array.from({ length: int(count * 2) }, () => {
    const a = refs[int(refs.length)]!;
    const b = refs[int(refs.length)]!;
    const [from, to] = acyclic && key(a) > key(b) ? [b, a] : [a, b];
    return { from, to, label: null };
  });
  return { title: 'Teste', blocks, groups: filled, links, corrections: [] };
}

describe('layout automático: propriedades', () => {
  const seeds = Array.from({ length: 150 }, (_, i) => i + 1);

  function check(seed: number, acyclic: boolean) {
    const output = randomOutput(seed, acyclic);
    const flow = aiOutputToFlow(output, { newId: counter() });
    const label = `semente ${String(seed)}`;
    expect(flowContentSchema.safeParse(flow).success, label).toBe(true);
    expect(flow.blocks, label).toHaveLength(output.blocks.length);
    expect(flow.frames, label).toHaveLength(output.groups.length);

    // Tudo em múltiplos de 8, posição e tamanho.
    for (const item of [...flow.blocks, ...flow.frames]) {
      for (const value of [item.position.x, item.position.y, item.size.width, item.size.height]) {
        expect(value % 8, `${label}: ${item.id}`).toBe(0);
        expect(value, `${label}: ${item.id}`).toBe(snapToGrid(value));
      }
    }

    // Nenhum par de nós de cima (blocos soltos e molduras) se sobrepõe.
    const top: (Box & { id: string })[] = [
      ...flow.blocks.filter((b) => b.frameId === undefined),
      ...flow.frames,
    ].map((n) => ({ id: n.id, ...n.position, ...n.size }));
    for (const [i, a] of top.entries()) {
      for (const b of top.slice(i + 1))
        expect(apart(a, b), `${label}: ${a.id} x ${b.id}`).toBe(true);
    }

    // Todo bloco de um grupo fica dentro da moldura, e os do mesmo grupo não se sobrepõem.
    for (const frame of flow.frames) {
      const inside = flow.blocks.filter((b) => b.frameId === frame.id);
      expect(inside.length, label).toBeGreaterThan(0);
      for (const [i, a] of inside.entries()) {
        expect(a.position.x, label).toBeGreaterThanOrEqual(frame.position.x);
        expect(a.position.y, label).toBeGreaterThanOrEqual(frame.position.y);
        expect(a.position.x + a.size.width, label).toBeLessThanOrEqual(
          frame.position.x + frame.size.width,
        );
        expect(a.position.y + a.size.height, label).toBeLessThanOrEqual(
          frame.position.y + frame.size.height,
        );
        for (const b of inside.slice(i + 1)) {
          expect(
            apart({ ...a.position, ...a.size }, { ...b.position, ...b.size }),
            `${label}: ${a.id} x ${b.id} na moldura`,
          ).toBe(true);
        }
      }
    }

    // A largura do quadro respeita o limite (um nó sozinho pode passar dele).
    const bounds = flowBounds(flow)!;
    const widest = Math.max(...top.map((n) => n.width));
    expect(bounds.width, label).toBeLessThanOrEqual(Math.max(LAYOUT_MAX_WIDTH, widest));

    return flow;
  }

  it.each(seeds)('sem sobreposição, na grade e com os grupos inteiros (semente %i)', (seed) => {
    check(seed, false);
  });

  it.each(seeds.slice(0, 60))(
    'sem ciclos, o destino fica à direita ou abaixo da origem (semente %i)',
    (seed) => {
      const flow = check(seed, true);
      const boxOf = (id: string): Box => {
        const found = [...flow.blocks, ...flow.frames].find((n) => n.id === id)!;
        return { ...found.position, ...found.size };
      };
      // Sobe do bloco à moldura dele: a ordem vale entre nós do primeiro nível.
      const topOf = (id: string) => flow.blocks.find((b) => b.id === id)?.frameId ?? id;
      for (const arrow of flow.arrows) {
        const from = topOf(arrow.from.nodeId);
        const to = topOf(arrow.to.nodeId);
        if (from === to) continue;
        const a = boxOf(from);
        const b = boxOf(to);
        const ok = b.x >= a.x + a.width || b.y >= a.y + a.height;
        expect(ok, `semente ${String(seed)}: ${from} -> ${to}`).toBe(true);
      }
    },
  );

  it('é determinístico: a mesma saída dá as mesmas posições', () => {
    const output = randomOutput(7, false);
    const first = aiOutputToFlow(output, { newId: counter() });
    const second = aiOutputToFlow(output, { newId: counter() });
    expect(second).toEqual(first);
  });

  it('as setas saem do lado certo: para a direita quando o destino está depois', () => {
    const output = randomOutput(3, true);
    const flow = aiOutputToFlow(output, { newId: counter() });
    expect(flow.arrows.length).toBeGreaterThan(0);
    for (const arrow of flow.arrows) {
      const from = arrow.from.side;
      const to = arrow.to.side;
      // Os dois lados vêm juntos (ou nenhum, quando um nó está dentro do outro).
      expect(from === undefined).toBe(to === undefined);
      if (from === 'right') expect(to).toBe('left');
      if (from === 'bottom') expect(to).toBe('top');
    }
  });
});

describe('arrowSides', () => {
  const box = (x: number, y: number): Box => ({ x, y, width: 100, height: 100 });

  it('escolhe o lado pelo lugar do destino', () => {
    expect(arrowSides(box(0, 0), box(200, 0))).toEqual({ from: 'right', to: 'left' });
    expect(arrowSides(box(200, 0), box(0, 0))).toEqual({ from: 'left', to: 'right' });
    expect(arrowSides(box(0, 0), box(0, 200))).toEqual({ from: 'bottom', to: 'top' });
    expect(arrowSides(box(0, 200), box(0, 0))).toEqual({ from: 'top', to: 'bottom' });
  });

  it('um nó dentro do outro fica sem lado, e o quadro escolhe', () => {
    expect(arrowSides({ x: 0, y: 0, width: 400, height: 400 }, box(50, 50))).toBeNull();
  });
});

describe('appendFlowBelow', () => {
  const sample = () =>
    aiOutputToFlow(
      {
        title: 'x',
        blocks: [
          { type: 'card', ref: 'a', title: 'A', description: null, tag: null },
          { type: 'card', ref: 'b', title: 'B', description: null, tag: null },
        ],
        groups: [],
        links: [{ from: 'a', to: 'b', label: null }],
        corrections: [],
      },
      { newId: counter() },
    );

  function renamed(flow: FlowContent, prefix: string): FlowContent {
    const rename = (id: string) => `${prefix}${id}`;
    return {
      ...flow,
      blocks: flow.blocks.map((b) => ({ ...b, id: rename(b.id) })),
      frames: flow.frames.map((f) => ({ ...f, id: rename(f.id) })),
      arrows: flow.arrows.map((a) => ({
        ...a,
        id: rename(a.id),
        from: { ...a.from, nodeId: rename(a.from.nodeId) },
        to: { ...a.to, nodeId: rename(a.to.nodeId) },
      })),
    };
  }

  it('num quadro vazio o fluxo entra como está', () => {
    const added = sample();
    const merged = appendFlowBelow({ ...added, blocks: [], frames: [], arrows: [] }, added);
    expect(merged.blocks).toEqual(added.blocks);
    expect(merged.arrows).toEqual(added.arrows);
  });

  it('entra abaixo do que já existe, alinhado à esquerda, sem sobrepor e na grade', () => {
    const existing = renamed(sample(), 'velho-');
    // Quadro com a câmera salva e um bloco fora da grade (a pessoa pode ter arrastado sem ímã).
    const withViewport: FlowContent = {
      ...existing,
      viewport: { x: 10, y: 20, zoom: 1.5 },
      blocks: existing.blocks.map((b, i) =>
        i === 0 ? { ...b, position: { x: 13, y: 7 } } : { ...b, position: { x: 400, y: 130 } },
      ),
    };
    const merged = appendFlowBelow(withViewport, renamed(sample(), 'novo-'));
    expect(flowContentSchema.safeParse(merged).success).toBe(true);
    expect(merged.blocks).toHaveLength(4);
    expect(merged.arrows).toHaveLength(2);
    expect(merged.viewport).toBeUndefined();

    const bounds = flowBounds(withViewport)!;
    const added = merged.blocks.slice(2);
    for (const block of added) {
      expect(block.position.y).toBeGreaterThanOrEqual(bounds.y + bounds.height + APPEND_GAP);
      expect(block.position.x % 8).toBe(0);
      expect(block.position.y % 8).toBe(0);
    }
    for (const old of merged.blocks.slice(0, 2)) {
      for (const block of added) {
        expect(apart({ ...old.position, ...old.size }, { ...block.position, ...block.size })).toBe(
          true,
        );
      }
    }
  });

  it('recusa quando um id se repete', () => {
    const flow = sample();
    expect(() => appendFlowBelow(flow, flow)).toThrow();
  });

  it('o passo do modo aula que já existia continua no mesmo lugar', () => {
    const existing = renamed(sample(), 'velho-');
    const step = { id: 'passo', targetIds: [existing.blocks[0]!.id] };
    const merged = appendFlowBelow({ ...existing, presentation: [step] }, renamed(sample(), 'n-'));
    expect(merged.presentation).toEqual([step]);
    expect(merged.presentation).toHaveLength(1);
  });
});

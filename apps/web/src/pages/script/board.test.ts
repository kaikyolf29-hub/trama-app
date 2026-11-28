import {
  createEmptyFlow,
  createEmptyScript,
  createScene,
  flowContentSchema,
  scriptContentSchema,
  type CardBlock,
  type FlowContent,
} from '@trama/core';
import { describe, expect, it } from 'vitest';
import {
  bringCardsFromBoard,
  createCardsOnBoard,
  linkedCount,
  updateBoardFromScript,
  updateScriptFromBoard,
} from './board';

const sequence = () => {
  let n = 0;
  return () => `id-${++n}`;
};

const card = (id: string, x: number, title = id, description?: string): CardBlock => ({
  id,
  type: 'card',
  position: { x, y: 128 },
  size: { width: 280, height: 144 },
  locked: false,
  zIndex: 0,
  title,
  ...(description === undefined ? {} : { description }),
});

const flowWith = (...blocks: CardBlock[]): FlowContent =>
  flowContentSchema.parse({ ...createEmptyFlow(), blocks });

const scriptOf = (...scenes: ReturnType<typeof createScene>[]) =>
  scriptContentSchema.parse({ scenes });

describe('Criar no quadro', () => {
  it('cria um cartão por cena, com título, fala e "Cena N", e liga as duas pontas', () => {
    const script = scriptOf(
      createScene({ id: 'a', title: 'Gancho', narration: 'Oi' }),
      createScene({ id: 'b', title: 'Problema' }),
    );
    const result = createCardsOnBoard(script, createEmptyFlow(), sequence());
    expect(result.changed).toBe(2);
    const cards = result.flow.blocks.filter((block) => block.type === 'card');
    expect(cards.map((c) => [c.title, c.description, c.tag])).toEqual([
      ['Gancho', 'Oi', 'Cena 1'],
      ['Problema', undefined, 'Cena 2'],
    ]);
    expect(result.script.scenes.map((scene) => scene.cardId)).toEqual(cards.map((c) => c.id));
    // Fila na grade de 8 px, uma seta entre as duas cenas, e o resultado vale para o core.
    expect(cards.map((c) => c.position)).toEqual([
      { x: 112, y: 128 },
      { x: 448, y: 128 },
    ]);
    expect(result.flow.arrows).toHaveLength(1);
    expect(result.flow.arrows[0]).toMatchObject({
      from: { nodeId: cards[0]?.id },
      to: { nodeId: cards[1]?.id },
    });
    expect(flowContentSchema.safeParse(result.flow).success).toBe(true);
    expect(scriptContentSchema.safeParse(result.script).success).toBe(true);
  });

  it('só cria o cartão de quem ainda não tem, ao lado do vizinho, sem repetir seta', () => {
    const script = scriptOf(
      createScene({ id: 'a', title: 'A', cardId: 'ca' }),
      createScene({ id: 'b', title: 'B' }),
    );
    const flow = flowWith(card('ca', 112));
    const result = createCardsOnBoard(script, flow, sequence());
    expect(result.changed).toBe(1);
    expect(result.flow.blocks).toHaveLength(2);
    expect(result.flow.blocks[0]).toEqual(flow.blocks[0]);
    expect(result.flow.blocks[1]?.position).toEqual({ x: 448, y: 128 });
    expect(result.flow.arrows).toHaveLength(1);

    // Rodar de novo não muda nada.
    const again = createCardsOnBoard(result.script, result.flow, sequence());
    expect(again.changed).toBe(0);
    expect(again.flow).toBe(result.flow);
  });

  it('cena cujo cartão foi apagado no quadro ganha um cartão novo', () => {
    const script = scriptOf(createScene({ id: 'a', title: 'A', cardId: 'sumiu' }));
    const result = createCardsOnBoard(script, createEmptyFlow(), sequence());
    expect(result.changed).toBe(1);
    expect(result.script.scenes[0]?.cardId).toBe('id-1');
  });

  it('com o quadro já ocupado, a fila começa embaixo de tudo e não cai em cima de nada', () => {
    const flow = flowWith(card('x', 112));
    const result = createCardsOnBoard(
      scriptOf(createScene({ id: 'a', title: 'A' })),
      flow,
      sequence(),
    );
    const created = result.flow.blocks[1];
    expect(created?.position).toEqual({ x: 112, y: 352 });
    expect(created?.position.y).toBeGreaterThanOrEqual(128 + 144);
  });

  it('um roteiro sem cenas não muda o quadro', () => {
    const flow = flowWith(card('x', 112));
    const result = createCardsOnBoard(createEmptyScript(), flow, sequence());
    expect(result).toEqual({ script: createEmptyScript(), flow, changed: 0 });
  });
});

describe('Trazer do quadro', () => {
  it('cada cartão que ainda não é cena vira uma cena ligada, da esquerda para a direita', () => {
    const flow = flowWith(card('c2', 448, 'Segundo', 'Fala 2'), card('c1', 112, 'Primeiro'));
    const result = bringCardsFromBoard(createEmptyScript(), flow, sequence());
    expect(result.changed).toBe(2);
    expect(result.script.scenes.map((s) => [s.title, s.narration, s.cardId])).toEqual([
      ['Primeiro', '', 'c1'],
      ['Segundo', 'Fala 2', 'c2'],
    ]);
  });

  it('não repete cartão que já é cena e solta a cena de cartão que sumiu', () => {
    const script = scriptOf(
      createScene({ id: 'a', title: 'A', cardId: 'c1' }),
      createScene({ id: 'b', title: 'B', cardId: 'sumiu' }),
    );
    const result = bringCardsFromBoard(
      script,
      flowWith(card('c1', 112), card('c2', 448)),
      sequence(),
    );
    expect(result.script.scenes.map((s) => s.cardId)).toEqual(['c1', undefined, 'c2']);
    expect(result.changed).toBe(1);
  });

  it('ignora o que não é cartão', () => {
    const flow = flowContentSchema.parse({
      ...createEmptyFlow(),
      blocks: [
        {
          id: 's',
          type: 'sticky',
          position: { x: 0, y: 0 },
          size: { width: 136, height: 104 },
          text: 'nota',
        },
      ],
    });
    expect(bringCardsFromBoard(createEmptyScript(), flow).changed).toBe(0);
  });
});

describe('Atualizar do quadro e Atualizar o quadro', () => {
  const script = scriptOf(
    createScene({
      id: 'a',
      title: 'Título novo',
      narration: 'Fala nova',
      notes: 'N',
      cardId: 'c1',
    }),
    createScene({ id: 'b', title: 'Sem cartão' }),
  );
  const flow = flowWith(card('c1', 112, 'Título velho', 'Fala velha'));

  it('do quadro para o roteiro: título e fala; B-roll, notas e tempo ficam', () => {
    const result = updateScriptFromBoard(
      scriptOf(
        createScene({
          id: 'a',
          title: 'x',
          narration: 'y',
          notes: 'Notas',
          time: '0:10',
          cardId: 'c1',
        }),
        createScene({ id: 'b', title: 'Sem cartão' }),
      ),
      flow,
    );
    expect(result.changed).toBe(1);
    expect(result.script.scenes[0]).toMatchObject({
      title: 'Título velho',
      narration: 'Fala velha',
      notes: 'Notas',
      time: '0:10',
      cardId: 'c1',
    });
  });

  it('do roteiro para o quadro: título, fala e etiqueta; posição e tamanho ficam', () => {
    const result = updateBoardFromScript(script, flow);
    expect(result.changed).toBe(1);
    expect(result.flow.blocks[0]).toMatchObject({
      type: 'card',
      title: 'Título novo',
      description: 'Fala nova',
      tag: 'Cena 1',
      position: { x: 112, y: 128 },
    });
    expect(flowContentSchema.safeParse(result.flow).success).toBe(true);
  });

  it('sem diferença, nada muda (e nada precisa ser gravado)', () => {
    const synced = updateBoardFromScript(script, flow);
    const again = updateBoardFromScript(script, synced.flow);
    expect(again.changed).toBe(0);
    expect(again.flow).toBe(synced.flow);
    const back = updateScriptFromBoard(script, synced.flow);
    expect(back.changed).toBe(0);
    expect(back.script).toBe(script);
  });
});

describe('resumo', () => {
  it('conta só as cenas cujo cartão ainda existe no quadro', () => {
    const script = scriptOf(
      createScene({ id: 'a', cardId: 'c1' }),
      createScene({ id: 'b', cardId: 'sumiu' }),
      createScene({ id: 'c' }),
    );
    expect(linkedCount(script, flowWith(card('c1', 112)))).toBe(1);
  });
});

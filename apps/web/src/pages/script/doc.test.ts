import { createScene, scriptContentSchema } from '@trama/core';
import { describe, expect, it } from 'vitest';
import { docToScenes, scenesToDoc } from './doc';

const sequence = () => {
  let n = 0;
  return () => `novo-${++n}`;
};

describe('cenas ↔ documento do editor', () => {
  it('uma cena vira título, notas, fala e B-roll, nessa ordem', () => {
    const scene = createScene({
      id: 'a',
      title: 'Gancho',
      time: '0:00–0:15',
      narration: 'Primeira linha\nSegunda linha',
      broll: ['Plano aberto', 'Zoom'],
      notes: 'Abrir com o antes e depois',
    });
    const doc = scenesToDoc([scene]);
    expect(doc.content?.map((node) => node.type)).toEqual([
      'sceneTitle',
      'paragraph',
      'narration',
      'narration',
      'broll',
      'broll',
    ]);
    expect(doc.content?.[0]).toEqual({
      type: 'sceneTitle',
      attrs: { id: 'a', time: '0:00–0:15' },
      content: [{ type: 'text', text: 'Gancho' }],
    });
  });

  it('o caminho de ida e volta devolve as mesmas cenas, com o cartão ligado', () => {
    const scenes = [
      createScene({
        id: 'a',
        title: 'Gancho',
        time: '0:00',
        narration: 'Fala\n\nOutra',
        broll: ['Um'],
        notes: 'Notas\nem duas linhas',
        cardId: 'cartao-a',
      }),
      createScene({ id: 'b', title: 'Só o título' }),
      createScene({ id: 'c', notes: 'Só notas' }),
    ];
    expect(docToScenes(scenesToDoc(scenes), scenes)).toEqual(scenes);
  });

  it('sem cenas, o documento tem uma cena em branco para escrever', () => {
    const doc = scenesToDoc([], sequence());
    expect(doc.content?.map((node) => node.type)).toEqual(['sceneTitle', 'paragraph']);
    expect(docToScenes(doc, [], sequence())).toEqual([
      expect.objectContaining({ id: 'novo-1', title: '', narration: '', broll: [], notes: '' }),
    ]);
  });

  it('o resultado sempre cabe no contrato do roteiro', () => {
    const scenes = [createScene({ id: 'a', title: 'x', broll: ['b'] })];
    const back = docToScenes(scenesToDoc(scenes), scenes);
    expect(scriptContentSchema.safeParse({ scenes: back }).success).toBe(true);
  });

  it('a ordem que a pessoa escreveu vira os campos certos, e os vazios somem', () => {
    const scenes = docToScenes({
      type: 'doc',
      content: [
        {
          type: 'sceneTitle',
          attrs: { id: 'a', time: ' 1:00 ' },
          content: [{ type: 'text', text: ' Cena ' }],
        },
        { type: 'broll', content: [{ type: 'text', text: 'Plano' }] },
        { type: 'broll' },
        { type: 'narration', content: [{ type: 'text', text: 'Fala' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Nota' }] },
        { type: 'paragraph' },
      ],
    });
    expect(scenes).toEqual([
      {
        id: 'a',
        title: 'Cena',
        time: '1:00',
        narration: 'Fala',
        broll: ['Plano'],
        notes: 'Nota',
      },
    ]);
  });

  it('cena sem id ou com id repetido ganha id novo; o cartão fica com a primeira', () => {
    const previous = [createScene({ id: 'a', title: 'A', cardId: 'cartao-a' })];
    const title = (id: unknown, text: string) => ({
      type: 'sceneTitle',
      attrs: { id, time: '' },
      content: [{ type: 'text', text }],
    });
    const scenes = docToScenes(
      { type: 'doc', content: [title('a', 'A'), title('a', 'A de novo'), title(null, 'Sem id')] },
      previous,
      sequence(),
    );
    expect(scenes.map((scene) => scene.id)).toEqual(['a', 'novo-1', 'novo-2']);
    expect(scenes.map((scene) => scene.cardId)).toEqual(['cartao-a', undefined, undefined]);
  });

  it('texto antes do primeiro título não se perde', () => {
    const scenes = docToScenes(
      { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Solta' }] }] },
      [],
      sequence(),
    );
    expect(scenes).toEqual([expect.objectContaining({ id: 'novo-1', notes: 'Solta' })]);
  });

  it('corta o que passa dos limites do contrato em vez de falhar', () => {
    const [scene] = docToScenes({
      type: 'doc',
      content: [
        {
          type: 'sceneTitle',
          attrs: { id: 'a', time: 't'.repeat(100) },
          content: [{ type: 'text', text: 'x'.repeat(300) }],
        },
        ...Array.from({ length: 150 }, () => ({
          type: 'broll',
          content: [{ type: 'text', text: 'b'.repeat(600) }],
        })),
      ],
    });
    expect(scene?.title).toHaveLength(200);
    expect(scene?.time).toHaveLength(40);
    expect(scene?.broll).toHaveLength(100);
    expect(scene?.broll[0]).toHaveLength(500);
  });
});

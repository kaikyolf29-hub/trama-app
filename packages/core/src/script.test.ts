import { describe, expect, it } from 'vitest';
import { cardBlockSchema, type CardBlock } from './blocks';
import { projectSchema } from './project';
import {
  addScene,
  applyCardToScene,
  applySceneToCard,
  cardFromScene,
  createEmptyScript,
  createScene,
  findSceneByCard,
  linkSceneToCard,
  moveScene,
  removeScene,
  sceneCardTag,
  sceneFromCard,
  scenesWithoutCard,
  scriptContentSchema,
  unlinkMissingCards,
  unlinkScene,
  updateScene,
} from './script';

const gancho = createScene({
  id: 'gancho',
  title: 'Gancho',
  time: '0:00–0:15',
  narration: 'Esse vídeo tinha 40 minutos. Agora tem 8.',
  broll: ['Antes e depois'],
  notes: 'Abrir sem explicar nada',
});
const problema = createScene({ id: 'problema', title: 'Mostrar o problema' });

function script() {
  return addScene(addScene(createEmptyScript(), gancho), problema);
}

describe('scriptContentSchema', () => {
  it('conteúdo vazio vira roteiro vazio', () => {
    expect(scriptContentSchema.parse({})).toEqual({
      schemaVersion: 1,
      flowId: null,
      targetDuration: '',
      scenes: [],
    });
    expect(createEmptyScript().scenes).toEqual([]);
  });

  it('um projeto de roteiro com conteúdo {} continua valendo', () => {
    const project = projectSchema.parse({
      id: '6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f',
      kind: 'script',
      title: 'Roteiro — Episódio 12',
      content: {},
      createdAt: '2026-11-12T14:32:00-03:00',
      updatedAt: '2026-11-12T14:32:00-03:00',
    });
    expect(project.kind === 'script' && project.content.scenes).toEqual([]);
  });

  it('preenche os padrões da cena', () => {
    const parsed = scriptContentSchema.parse({ scenes: [{ id: 'a' }] });
    expect(parsed.scenes[0]).toEqual({
      id: 'a',
      title: '',
      time: '',
      narration: '',
      broll: [],
      notes: '',
    });
  });

  it('recusa id de cena repetido e cartão ligado a duas cenas', () => {
    expect(scriptContentSchema.safeParse({ scenes: [{ id: 'a' }, { id: 'a' }] }).success).toBe(
      false,
    );
    expect(
      scriptContentSchema.safeParse({
        scenes: [
          { id: 'a', cardId: 'c' },
          { id: 'b', cardId: 'c' },
        ],
      }).success,
    ).toBe(false);
  });

  it('recusa versão desconhecida e fluxo que não é uuid', () => {
    expect(scriptContentSchema.safeParse({ schemaVersion: 2 }).success).toBe(false);
    expect(scriptContentSchema.safeParse({ flowId: 'x' }).success).toBe(false);
  });
});

describe('editar as cenas', () => {
  it('cria cena com id próprio quando não recebe um', () => {
    const a = createScene();
    const b = createScene({ title: 'Outra' });
    expect(a.id).not.toBe(b.id);
    expect(b.title).toBe('Outra');
  });

  it('adiciona no fim ou na posição dada', () => {
    const extra = createScene({ id: 'extra' });
    expect(addScene(script(), extra).scenes.map((s) => s.id)).toEqual([
      'gancho',
      'problema',
      'extra',
    ]);
    expect(addScene(script(), extra, 1).scenes.map((s) => s.id)).toEqual([
      'gancho',
      'extra',
      'problema',
    ]);
    expect(addScene(script(), extra, 99).scenes.map((s) => s.id)).toEqual([
      'gancho',
      'problema',
      'extra',
    ]);
  });

  it('atualiza, remove e move sem mexer no original', () => {
    const original = script();
    expect(updateScene(original, 'gancho', { title: 'Abertura' }).scenes[0]?.title).toBe(
      'Abertura',
    );
    expect(original.scenes[0]?.title).toBe('Gancho');
    expect(removeScene(original, 'gancho').scenes.map((s) => s.id)).toEqual(['problema']);
    expect(moveScene(original, 'problema', 0).scenes.map((s) => s.id)).toEqual([
      'problema',
      'gancho',
    ]);
    expect(moveScene(original, 'nada', 0)).toBe(original);
  });
});

describe('cena e cartão do quadro', () => {
  const position = { x: 112, y: 128 };

  it('cria o cartão a partir da cena', () => {
    const card = cardFromScene(gancho, { id: 'card-1', position, index: 0 });
    expect(cardBlockSchema.safeParse(card).success).toBe(true);
    expect(card).toMatchObject({
      id: 'card-1',
      type: 'card',
      position,
      tag: 'Cena 1',
      title: 'Gancho',
      description: 'Esse vídeo tinha 40 minutos. Agora tem 8.',
    });
    expect(card.size).toEqual({ width: 280, height: 144 });
  });

  it('cena sem fala vira cartão sem descrição', () => {
    const card = cardFromScene(problema, { id: 'card-2', position, index: 1 });
    expect(card.description).toBeUndefined();
    expect(card.tag).toBe('Cena 2');
    expect(sceneCardTag(2)).toBe('Cena 3');
  });

  it('cria a cena a partir do cartão e já a liga', () => {
    const card: CardBlock = cardBlockSchema.parse({
      id: 'card-9',
      type: 'card',
      position,
      size: { width: 280, height: 144 },
      title: 'Exemplo',
      description: 'Mostre na prática',
    });
    const scene = sceneFromCard(card, 'cena-9');
    expect(scene).toMatchObject({
      id: 'cena-9',
      title: 'Exemplo',
      narration: 'Mostre na prática',
      cardId: 'card-9',
    });
    expect(sceneFromCard(card).id).not.toBe('cena-9');
  });

  it('ida e volta mantém título e fala, e preserva o que só existe de um lado', () => {
    const card = cardFromScene(gancho, { id: 'card-1', position, index: 0 });
    const edited: CardBlock = {
      ...card,
      title: 'Abertura',
      description: 'Nova fala',
      position: { x: 500, y: 500 },
    };
    expect(applyCardToScene(gancho, edited)).toEqual({
      ...gancho,
      title: 'Abertura',
      narration: 'Nova fala',
    });
    const back = applySceneToCard(edited, { ...gancho, title: 'Gancho 2', narration: '' }, 3);
    expect(back).toMatchObject({ title: 'Gancho 2', tag: 'Cena 4', position: { x: 500, y: 500 } });
    expect('description' in back).toBe(false);
  });

  it('liga, solta e acha a cena pelo cartão', () => {
    const linked = linkSceneToCard(script(), 'gancho', 'card-1');
    expect(findSceneByCard(linked, 'card-1')?.id).toBe('gancho');
    expect(scenesWithoutCard(linked).map((s) => s.id)).toEqual(['problema']);
    expect(scriptContentSchema.safeParse(linked).success).toBe(true);

    // Ligar o mesmo cartão a outra cena solta a primeira (um cartão, uma cena).
    const moved = linkSceneToCard(linked, 'problema', 'card-1');
    expect(findSceneByCard(moved, 'card-1')?.id).toBe('problema');
    expect(moved.scenes[0]?.cardId).toBeUndefined();
    expect(scriptContentSchema.safeParse(moved).success).toBe(true);

    expect(unlinkScene(moved, 'problema').scenes.every((s) => s.cardId === undefined)).toBe(true);
  });

  it('solta as cenas cujo cartão foi apagado do quadro', () => {
    let linked = linkSceneToCard(script(), 'gancho', 'card-1');
    linked = linkSceneToCard(linked, 'problema', 'card-2');
    const cleaned = unlinkMissingCards(linked, ['card-2']);
    expect(cleaned.scenes.map((s) => s.cardId)).toEqual([undefined, 'card-2']);
  });
});

import { sceneSchema, type Scene } from '@trama/core';
import type { JSONContent } from '@tiptap/core';

/**
 * O documento do Tiptap é só a forma de editar. O que se guarda são as cenas do core
 * (`scriptContentSchema`); estas duas funções puras levam de um para o outro.
 *
 * O documento é uma fila de blocos, e uma cena vai de um `sceneTitle` até o próximo:
 * - `sceneTitle`: o título (texto) e o tempo (atributo `time`), mais o `id` da cena;
 * - `paragraph`: as notas da cena (uma linha por parágrafo);
 * - `narration`: a fala, uma linha por bloco;
 * - `broll`: um plano ou B-roll por bloco.
 * O `cardId` (cartão do quadro) não entra no documento: fica nas cenas, pelo `id`.
 */
export const NODE = {
  title: 'sceneTitle',
  notes: 'paragraph',
  narration: 'narration',
  broll: 'broll',
} as const;

const LIMITS = {
  title: 200,
  time: 40,
  text: 20_000,
  brollItem: 500,
  brollItems: 100,
  scenes: 500,
} as const;

type IdFactory = () => string;

/** O texto de um bloco (o documento só tem texto, sem marcas). */
function textOf(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? '';
  return (node.content ?? []).map(textOf).join('');
}

function textNodes(text: string): JSONContent[] | undefined {
  return text === '' ? undefined : [{ type: 'text', text }];
}

function block(type: string, text: string, attrs?: Record<string, unknown>): JSONContent {
  const content = textNodes(text);
  return {
    type,
    ...(attrs ? { attrs } : {}),
    ...(content ? { content } : {}),
  };
}

/** As cenas viram o documento do editor. Sem cenas, o documento tem uma cena em branco. */
export function scenesToDoc(
  scenes: readonly Scene[],
  newId: IdFactory = () => crypto.randomUUID(),
): JSONContent {
  const content: JSONContent[] = [];
  const list = scenes.length > 0 ? scenes : [blankScene(newId)];
  for (const scene of list) {
    content.push(block(NODE.title, scene.title, { id: scene.id, time: scene.time }));
    const body: JSONContent[] = [];
    if (scene.notes !== '') {
      for (const line of scene.notes.split('\n')) body.push(block(NODE.notes, line));
    }
    if (scene.narration !== '') {
      for (const line of scene.narration.split('\n')) body.push(block(NODE.narration, line));
    }
    for (const item of scene.broll) body.push(block(NODE.broll, item));
    // Uma cena sem nada embaixo ganha um parágrafo vazio, para ter onde escrever.
    content.push(...(body.length > 0 ? body : [block(NODE.notes, '')]));
  }
  return { type: 'doc', content };
}

function blankScene(newId: IdFactory): Scene {
  return sceneSchema.parse({ id: newId() });
}

/**
 * O documento do editor vira as cenas. `previous` traz as cenas de antes: delas vêm o `cardId`
 * (o editor não o conhece). Cena sem id, ou com id repetido (colar uma cena, dividir um título),
 * ganha um id novo, e então perde a ligação com o cartão, que é de uma cena só.
 */
export function docToScenes(
  doc: JSONContent,
  previous: readonly Scene[] = [],
  newId: IdFactory = () => crypto.randomUUID(),
): Scene[] {
  interface Draft {
    id: string;
    title: string;
    time: string;
    notes: string[];
    narration: string[];
    broll: string[];
  }
  const cardOf = new Map(previous.flatMap((s) => (s.cardId ? [[s.id, s.cardId] as const] : [])));
  const seen = new Set<string>();
  const drafts: Draft[] = [];
  let current: Draft | undefined;

  const start = (title: string, rawId: unknown, time: unknown): Draft => {
    let id = typeof rawId === 'string' && rawId !== '' ? rawId : newId();
    if (seen.has(id)) id = newId();
    seen.add(id);
    const draft: Draft = {
      id,
      title,
      time: typeof time === 'string' ? time : '',
      notes: [],
      narration: [],
      broll: [],
    };
    drafts.push(draft);
    return draft;
  };

  for (const node of doc.content ?? []) {
    if (node.type === NODE.title) {
      current = start(textOf(node), node.attrs?.['id'], node.attrs?.['time']);
      continue;
    }
    // Bloco solto antes do primeiro título (o esquema do editor não deixa, mas não perde texto).
    current ??= start('', undefined, undefined);
    const text = textOf(node);
    if (node.type === NODE.narration) current.narration.push(text);
    else if (node.type === NODE.broll) current.broll.push(text);
    else current.notes.push(text);
  }

  const used = new Set<string>();
  return drafts.slice(0, LIMITS.scenes).map((draft) => {
    const cardId = cardOf.get(draft.id);
    // O cartão é de uma cena só: se a cena foi duplicada, só a primeira fica com ele.
    const keepCard = cardId !== undefined && !used.has(cardId);
    if (keepCard) used.add(cardId);
    return sceneSchema.parse({
      id: draft.id,
      title: draft.title.slice(0, LIMITS.title),
      time: draft.time.slice(0, LIMITS.time),
      narration: joinLines(draft.narration),
      broll: draft.broll
        .map((item) => item.trim().slice(0, LIMITS.brollItem))
        .filter((item) => item !== '')
        .slice(0, LIMITS.brollItems),
      notes: joinLines(draft.notes),
      ...(keepCard ? { cardId } : {}),
    });
  });
}

/** Junta as linhas; as vazias do fim (o parágrafo de espera) não contam. */
function joinLines(lines: string[]): string {
  return lines.join('\n').trimEnd().slice(0, LIMITS.text);
}

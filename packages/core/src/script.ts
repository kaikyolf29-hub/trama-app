import { z } from 'zod';
import { cardBlockSchema, type CardBlock } from './blocks';
import { idSchema, type Point } from './geometry';

/**
 * Conteúdo de um projeto do tipo roteiro (`kind: 'script'`, tela 3). O editor é o Tiptap
 * (etapa 2.3), mas o que se guarda é o formato do Trama: uma lista de cenas com título, fala,
 * B-roll e notas. É simples para a IA e o MCP produzirem, e cada cena pode apontar para um cartão
 * do quadro (`cardId`), que é como "cada cena vira um cartão, e vice-versa".
 */
export const SCRIPT_SCHEMA_VERSION = 1;

export const sceneSchema = z.object({
  /** Estável: o cartão do quadro e o editor apontam para ela por aqui. */
  id: idSchema,
  title: z.string().trim().max(200).default(''),
  /** Marcação de tempo livre, ex.: "0:00–0:15". */
  time: z.string().trim().max(40).default(''),
  /** O que é dito (o bloco "Fala" da tela 3). */
  narration: z.string().max(20000).default(''),
  /** Planos e B-roll, um por item. */
  broll: z.array(z.string().max(500)).max(100).default([]),
  /** Direção e anotações da cena. */
  notes: z.string().max(20000).default(''),
  /** Cartão do quadro ligado a esta cena, se já existe. */
  cardId: idSchema.optional(),
});

export type Scene = z.infer<typeof sceneSchema>;
export type SceneInput = z.input<typeof sceneSchema>;

export const scriptContentSchema = z
  .object({
    schemaVersion: z.literal(SCRIPT_SCHEMA_VERSION).default(SCRIPT_SCHEMA_VERSION),
    /** Projeto do tipo fluxo ligado ao roteiro ("Fluxo vinculado"). */
    flowId: z.uuid().nullable().default(null),
    /** "Duração alvo" da tela 3, em texto livre (ex.: "8–10 min"). */
    targetDuration: z.string().trim().max(40).default(''),
    scenes: z.array(sceneSchema).max(500).default([]),
  })
  .superRefine((script, ctx) => {
    const ids = new Set<string>();
    const cards = new Set<string>();
    script.scenes.forEach((scene, i) => {
      if (ids.has(scene.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `id de cena repetido: ${scene.id}`,
          path: ['scenes', i, 'id'],
        });
      }
      ids.add(scene.id);
      if (scene.cardId !== undefined) {
        if (cards.has(scene.cardId)) {
          ctx.addIssue({
            code: 'custom',
            message: `o cartão ${scene.cardId} já está ligado a outra cena`,
            path: ['scenes', i, 'cardId'],
          });
        }
        cards.add(scene.cardId);
      }
    });
  });

export type ScriptContent = z.infer<typeof scriptContentSchema>;
export type ScriptContentInput = z.input<typeof scriptContentSchema>;

/** Roteiro vazio: é o que vale quando o conteúdo gravado é `{}`. */
export function createEmptyScript(): ScriptContent {
  return scriptContentSchema.parse({});
}

/** Cena nova. Sem `id`, sorteia um. */
export function createScene(init: Partial<SceneInput> = {}): Scene {
  return sceneSchema.parse({ ...init, id: init.id ?? crypto.randomUUID() });
}

/** Põe a cena na posição `index` (no fim, se omitido). */
export function addScene(script: ScriptContent, scene: Scene, index?: number): ScriptContent {
  const at = index === undefined ? script.scenes.length : clamp(index, 0, script.scenes.length);
  return {
    ...script,
    scenes: [...script.scenes.slice(0, at), scene, ...script.scenes.slice(at)],
  };
}

/** Muda campos de uma cena. Cena que não existe: devolve o roteiro como estava. */
export function updateScene(
  script: ScriptContent,
  sceneId: string,
  patch: Partial<Omit<Scene, 'id'>>,
): ScriptContent {
  return {
    ...script,
    scenes: script.scenes.map((scene) => (scene.id === sceneId ? { ...scene, ...patch } : scene)),
  };
}

export function removeScene(script: ScriptContent, sceneId: string): ScriptContent {
  return { ...script, scenes: script.scenes.filter((scene) => scene.id !== sceneId) };
}

/** Muda a cena de lugar (arrastar na lista "Cenas no fluxo"). */
export function moveScene(script: ScriptContent, sceneId: string, toIndex: number): ScriptContent {
  const from = script.scenes.findIndex((scene) => scene.id === sceneId);
  if (from === -1) return script;
  const scenes = [...script.scenes];
  const [scene] = scenes.splice(from, 1);
  if (!scene) return script;
  scenes.splice(clamp(toIndex, 0, scenes.length), 0, scene);
  return { ...script, scenes };
}

export function findSceneByCard(script: ScriptContent, cardId: string): Scene | undefined {
  return script.scenes.find((scene) => scene.cardId === cardId);
}

/** Cenas que ainda não viraram cartão. */
export function scenesWithoutCard(script: ScriptContent): Scene[] {
  return script.scenes.filter((scene) => scene.cardId === undefined);
}

/** Liga a cena a um cartão. O cartão que já estava ligado a outra cena é solto dela. */
export function linkSceneToCard(
  script: ScriptContent,
  sceneId: string,
  cardId: string,
): ScriptContent {
  return {
    ...script,
    scenes: script.scenes.map((scene) => {
      if (scene.id === sceneId) return { ...scene, cardId };
      if (scene.cardId === cardId) return withoutCard(scene);
      return scene;
    }),
  };
}

/** Solta a cena do cartão (por exemplo, quando o cartão é apagado no quadro). */
export function unlinkScene(script: ScriptContent, sceneId: string): ScriptContent {
  return {
    ...script,
    scenes: script.scenes.map((scene) => (scene.id === sceneId ? withoutCard(scene) : scene)),
  };
}

/** Solta as cenas cujo cartão não existe mais no quadro. */
export function unlinkMissingCards(
  script: ScriptContent,
  existingCardIds: Iterable<string>,
): ScriptContent {
  const existing = new Set(existingCardIds);
  return {
    ...script,
    scenes: script.scenes.map((scene) =>
      scene.cardId !== undefined && !existing.has(scene.cardId) ? withoutCard(scene) : scene,
    ),
  };
}

function withoutCard(scene: Scene): Scene {
  const { cardId: _removed, ...rest } = scene;
  return rest;
}

/** Etiqueta do cartão de cada cena, como no modelo "Roteiro de vídeo": "Cena 1". */
export function sceneCardTag(index: number): string {
  return `Cena ${index + 1}`;
}

/** Tamanho padrão do cartão de uma cena (o mesmo do cartão criado no quadro). */
export const SCENE_CARD_SIZE = { width: 280, height: 144 } as const;

/**
 * Cartão do quadro para uma cena: o título da cena, a fala como descrição e a etiqueta
 * "Cena N". B-roll e notas ficam só no roteiro. Quem chama escolhe o `id` e a posição, e depois liga a
 * cena ao cartão com `linkSceneToCard`.
 */
export function cardFromScene(
  scene: Scene,
  options: { id: string; position: Point; index: number },
): CardBlock {
  return cardBlockSchema.parse({
    id: options.id,
    type: 'card',
    position: options.position,
    size: SCENE_CARD_SIZE,
    tag: sceneCardTag(options.index),
    title: scene.title,
    description: sceneCardDescription(scene),
  });
}

/** Cena nova a partir de um cartão do quadro (vice-versa): já nasce ligada a ele. */
export function sceneFromCard(card: CardBlock, id: string = crypto.randomUUID()): Scene {
  return createScene({
    id,
    title: card.title,
    narration: card.description ?? '',
    cardId: card.id,
  });
}

/** Leva o que mudou na cena para o cartão ligado a ela. Posição, tamanho e selo ficam como estão. */
export function applySceneToCard(card: CardBlock, scene: Scene, index: number): CardBlock {
  const description = sceneCardDescription(scene);
  const { description: _old, ...rest } = card;
  return {
    ...rest,
    title: scene.title,
    tag: sceneCardTag(index),
    ...(description !== undefined ? { description } : {}),
  };
}

/** Leva o que mudou no cartão para a cena ligada a ele. B-roll, notas e tempo ficam como estão. */
export function applyCardToScene(scene: Scene, card: CardBlock): Scene {
  return { ...scene, title: card.title, narration: card.description ?? '' };
}

function sceneCardDescription(scene: Scene): string | undefined {
  return scene.narration.trim() !== '' ? scene.narration : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

import {
  applyCardToScene,
  applySceneToCard,
  cardFromScene,
  findSceneByCard,
  flowContentSchema,
  linkSceneToCard,
  SCENE_CARD_SIZE,
  sceneFromCard,
  snapToGrid,
  unlinkMissingCards,
  type Arrow,
  type Block,
  type CardBlock,
  type FlowContent,
  type Scene,
  type ScriptContent,
} from '@trama/core';

/**
 * Cena ↔ cartão (etapa 2.3). Funções puras sobre o roteiro e o fluxo ligado a ele; a tela só
 * escolhe qual chamar e grava o resultado. Nada sincroniza sozinho: cada função roda quando a
 * pessoa pede, e devolve o roteiro e o fluxo novos (ou os mesmos, se nada mudou).
 */

/** Espaço entre um cartão de cena e o seguinte: 280 px de largura mais 56 de respiro. */
const COLUMN_STEP = SCENE_CARD_SIZE.width + 56;
/** Onde começa a fila de cartões num quadro vazio, e o respiro embaixo do que já existe. */
const ORIGIN = { x: 112, y: 128 };
const GAP_BELOW = 80;

export interface Synced {
  script: ScriptContent;
  flow: FlowContent;
  /** Quantas cenas ou cartões a operação mexeu. */
  changed: number;
}

function cardsOf(flow: FlowContent): Map<string, CardBlock> {
  return new Map(
    flow.blocks.flatMap((block) => (block.type === 'card' ? [[block.id, block] as const] : [])),
  );
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const boxOf = (node: {
  position: { x: number; y: number };
  size: { width: number; height: number };
}): Box => ({
  ...node.position,
  ...node.size,
});

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * Onde o cartão da cena `index` entra: ao lado do cartão da cena vizinha, se ela já tem um; senão
 * numa fila nova embaixo de tudo. Se cair em cima de algo, anda para a direita até ter lugar.
 */
function placeCard(
  flow: FlowContent,
  script: ScriptContent,
  index: number,
): { x: number; y: number } {
  const cards = cardsOf(flow);
  const neighbour = (from: number, step: 1 | -1) => {
    for (let i = from; i >= 0 && i < script.scenes.length; i += step) {
      const cardId = script.scenes[i]?.cardId;
      const card = cardId === undefined ? undefined : cards.get(cardId);
      if (card) return { card, distance: Math.abs(i - index) };
    }
    return undefined;
  };
  const before = neighbour(index - 1, -1);
  const after = neighbour(index + 1, 1);
  const nodes = [...flow.blocks, ...flow.frames].map(boxOf);

  let spot: { x: number; y: number };
  if (before) {
    spot = {
      x: before.card.position.x + before.distance * COLUMN_STEP,
      y: before.card.position.y,
    };
  } else if (after) {
    spot = {
      x: after.card.position.x - after.distance * COLUMN_STEP,
      y: after.card.position.y,
    };
  } else {
    const bottom = nodes.reduce((max, box) => Math.max(max, box.y + box.height), 0);
    const left = nodes.reduce((min, box) => Math.min(min, box.x), ORIGIN.x);
    spot = nodes.length === 0 ? ORIGIN : { x: snapToGrid(left), y: snapToGrid(bottom + GAP_BELOW) };
  }
  spot = { x: snapToGrid(spot.x), y: snapToGrid(spot.y) };
  while (nodes.some((box) => overlaps({ ...spot, ...SCENE_CARD_SIZE }, box))) {
    spot = { x: spot.x + COLUMN_STEP, y: spot.y };
  }
  return spot;
}

function hasArrowBetween(flow: FlowContent, a: string, b: string): boolean {
  return flow.arrows.some(
    (arrow) =>
      (arrow.from.nodeId === a && arrow.to.nodeId === b) ||
      (arrow.from.nodeId === b && arrow.to.nodeId === a),
  );
}

/**
 * "Criar no quadro": cada cena sem cartão ganha um (`cardFromScene`) e fica ligada a ele. Cena
 * cujo cartão foi apagado no quadro volta a contar como sem cartão. Cartões vizinhos na ordem do
 * roteiro ganham uma seta, se ainda não tinham uma ligação.
 */
export function createCardsOnBoard(
  script: ScriptContent,
  flow: FlowContent,
  newId: () => string = () => crypto.randomUUID(),
): Synced {
  let nextScript = unlinkMissingCards(script, cardsOf(flow).keys());
  let nextFlow = flow;
  let changed = 0;
  const created = new Set<string>();

  nextScript.scenes.forEach((scene, index) => {
    if (scene.cardId !== undefined) return;
    const card = cardFromScene(scene, {
      id: newId(),
      position: placeCard(nextFlow, nextScript, index),
      index,
    });
    nextFlow = { ...nextFlow, blocks: [...nextFlow.blocks, card] };
    nextScript = linkSceneToCard(nextScript, scene.id, card.id);
    created.add(card.id);
    changed += 1;
  });

  const arrows: Arrow[] = [];
  nextScript.scenes.forEach((scene, index) => {
    const next = nextScript.scenes[index + 1];
    if (!scene.cardId || !next?.cardId) return;
    if (!created.has(scene.cardId) && !created.has(next.cardId)) return;
    if (
      hasArrowBetween(
        { ...nextFlow, arrows: [...nextFlow.arrows, ...arrows] },
        scene.cardId,
        next.cardId,
      )
    ) {
      return;
    }
    arrows.push({
      id: newId(),
      from: { nodeId: scene.cardId, side: 'right' },
      to: { nodeId: next.cardId, side: 'left' },
      route: 'curved',
    });
  });

  if (changed === 0) return { script: nextScript, flow, changed: 0 };
  // O resultado passa pelo esquema do fluxo: nunca grava algo que o quadro não abre.
  return {
    script: nextScript,
    flow: flowContentSchema.parse({ ...nextFlow, arrows: [...nextFlow.arrows, ...arrows] }),
    changed,
  };
}

/** Os cartões do quadro, da esquerda para a direita e, em empate, de cima para baixo. */
function inReadingOrder(cards: CardBlock[]): CardBlock[] {
  return [...cards].sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y);
}

/**
 * "Trazer do quadro": cada cartão que ainda não é cena vira uma cena no fim do roteiro, já
 * ligada a ele (`sceneFromCard`). Cena cujo cartão sumiu do quadro fica sem ligação.
 */
export function bringCardsFromBoard(
  script: ScriptContent,
  flow: FlowContent,
  newId: () => string = () => crypto.randomUUID(),
): Synced {
  const cards = cardsOf(flow);
  let next = unlinkMissingCards(script, cards.keys());
  let changed = 0;
  for (const card of inReadingOrder([...cards.values()])) {
    if (findSceneByCard(next, card.id)) continue;
    next = { ...next, scenes: [...next.scenes, sceneFromCard(card, newId())] };
    changed += 1;
  }
  return { script: next, flow, changed };
}

const sameScene = (a: Scene, b: Scene) =>
  a.title === b.title && a.narration === b.narration && a.cardId === b.cardId;

/** "Atualizar do quadro": o título e a descrição do cartão passam para a fala e o título da cena. */
export function updateScriptFromBoard(script: ScriptContent, flow: FlowContent): Synced {
  const cards = cardsOf(flow);
  let changed = 0;
  const scenes = script.scenes.map((scene) => {
    const card = scene.cardId === undefined ? undefined : cards.get(scene.cardId);
    if (!card) return scene;
    const next = applyCardToScene(scene, card);
    if (sameScene(scene, next)) return scene;
    changed += 1;
    return next;
  });
  return { script: changed > 0 ? { ...script, scenes } : script, flow, changed };
}

/** "Atualizar o quadro": o título, a fala e a etiqueta "Cena N" vão para o cartão de cada cena. */
export function updateBoardFromScript(script: ScriptContent, flow: FlowContent): Synced {
  const cards = cardsOf(flow);
  const replaced = new Map<string, Block>();
  script.scenes.forEach((scene, index) => {
    const card = scene.cardId === undefined ? undefined : cards.get(scene.cardId);
    if (!card) return;
    const next = applySceneToCard(card, scene, index);
    const same =
      next.title === card.title && next.tag === card.tag && next.description === card.description;
    if (!same) replaced.set(card.id, next);
  });
  if (replaced.size === 0) return { script, flow, changed: 0 };
  return {
    script,
    flow: flowContentSchema.parse({
      ...flow,
      blocks: flow.blocks.map((block) => replaced.get(block.id) ?? block),
    }),
    changed: replaced.size,
  };
}

/** Quantas cenas têm cartão no quadro agora (para o resumo da tela). */
export function linkedCount(script: ScriptContent, flow: FlowContent): number {
  const cards = cardsOf(flow);
  return script.scenes.filter((scene) => scene.cardId !== undefined && cards.has(scene.cardId))
    .length;
}

import { z } from 'zod';
import { eventLabel, isFutureNote, type AgendaEvent } from './agenda';
import { aiOutputToFlow, aiSuggestedTitle, clipText, type AiFlowOptions } from './ai-flow';
import {
  AI_LIMITS,
  aiFlowOutputSchema,
  aiOrganizeRequestSchema,
  aiOrganizeResponseSchema,
  type AiBlock,
  type AiFlowOutput,
  type AiGroup,
  type AiLink,
  type AiOrganizeResponse,
} from './ai';
import { projectSummarySchema, type ProjectSummary } from './api';
import { arrowSchema, type Arrow } from './arrow';
import {
  checklistBlockSchema,
  noteColorSchema,
  shapeKindSchema,
  textBlockSchema,
  textColorSchema,
  type Block,
  type CardBlock,
  type ChecklistBlock,
} from './blocks';
import {
  DEFAULT_TIME_ZONE,
  addDays,
  dateKeySchema,
  formatDateKey,
  parseDateKey,
  localDateKey,
  localTime,
  todayKey,
  weekdayOf,
  zonedInstant,
  type DateKey,
  type InstantRange,
} from './calendar';
import { flowContentSchema, type FlowContent } from './flow';
import { GRID_SIZE, snapToGrid } from './geometry';
import {
  lessonNotesSchema,
  lessonSchema,
  lessonTitleSchema,
  nextReviewDate,
  type Lesson,
} from './notebook';
import type { CreateLessonRequest } from './api-organization';
import { projectKindSchema, projectTitleSchema } from './project';
import {
  cardFromScene,
  createScene,
  linkSceneToCard,
  scriptContentSchema,
  type ScriptContent,
} from './script';
import { DEFAULT_BADGE_LABEL, dateTimeSchema, projectStatusSchema, setBadgeDone } from './status';

/**
 * As ferramentas do conector MCP (etapa 3.4): o que cada uma recebe e devolve, e a lógica de
 * montar blocos, setas, roteiros e aulas. Mora aqui para o quadro sempre abrir o que o MCP cria:
 * tudo passa pelos mesmos esquemas e pela mesma montagem da IA (`ai-flow.ts`). O Worker
 * `apps/mcp` só busca e grava pela API; não monta nada sozinho.
 */

/** Entrada que a pessoa (ou a IA dela) pode corrigir. A mensagem é uma frase em português. */
export class McpInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpInputError';
  }
}

/** Endereço do projeto no site: `/p/<id>`. */
export function projectUrl(appUrl: string | undefined, id: string): string {
  const base = (appUrl ?? '').replace(/\/+$/, '');
  return `${base}/p/${id}`;
}

/* -------------------------------------------------------------------------------------------- */
/* Blocos, grupos e ligações (criar_fluxo e adicionar_blocos)                                    */
/* -------------------------------------------------------------------------------------------- */

/**
 * O nome que o cliente dá a um bloco ou grupo para ligá-lo a outros ("b1"). Só vale dentro da
 * chamada; a resposta devolve o id de verdade de cada um.
 */
const refSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .describe('Nome curto (ex.: "b1") para ligar este item em `links` e `groups`.');

const optionalRef = refSchema.optional();

const textInput = z
  .object({
    type: z.literal('text'),
    ref: optionalRef,
    text: z.string().min(1).max(5000),
    style: z.enum(['title', 'body']).default('body').describe('"title" é um título grande.'),
    color: textColorSchema.default('normal'),
  })
  .describe('Texto solto: um título ou um parágrafo.');

const cardInput = z
  .object({
    type: z.literal('card'),
    ref: optionalRef,
    title: z.string().trim().min(1).max(200),
    description: z.string().max(2000).optional(),
    tag: z.string().trim().min(1).max(40).optional().describe('Etiqueta curta acima do título.'),
  })
  .describe('Cartão: etiqueta, título e descrição. É o bloco principal de um fluxo.');

const stickyInput = z
  .object({
    type: z.literal('sticky'),
    ref: optionalRef,
    text: z.string().min(1).max(2000),
    color: noteColorSchema.default('yellow'),
  })
  .describe('Nota adesiva.');

const shapeInput = z
  .object({
    type: z.literal('shape'),
    ref: optionalRef,
    shape: shapeKindSchema.default('rectangle'),
    text: z.string().max(500).default(''),
  })
  .describe('Forma (retângulo, elipse ou losango), com texto dentro.');

const checklistInput = z
  .object({
    type: z.literal('checklist'),
    ref: optionalRef,
    title: z.string().trim().max(80).default('Etapas'),
    items: z.array(z.string().trim().min(1).max(500)).min(1).max(40),
  })
  .describe('Etapas: uma lista para marcar. Todas começam desmarcadas.');

export const mcpBlockSchema = z.discriminatedUnion('type', [
  textInput,
  cardInput,
  stickyInput,
  shapeInput,
  checklistInput,
]);
export type McpBlock = z.infer<typeof mcpBlockSchema>;

export const mcpGroupSchema = z
  .object({
    ref: refSchema,
    title: z.string().trim().min(1).max(120),
    blockRefs: z.array(refSchema).min(1).max(AI_LIMITS.blocks),
  })
  .describe('Grupo: vira uma moldura com os blocos dentro. Um bloco fica em um grupo só.');
export type McpGroup = z.infer<typeof mcpGroupSchema>;

export const mcpLinkSchema = z
  .object({
    from: z.string().trim().min(1).max(64),
    to: z.string().trim().min(1).max(64),
    label: z.string().trim().min(1).max(200).optional(),
  })
  .describe(
    'Seta de `from` para `to`. Cada ponta é o `ref` de um bloco ou grupo novo (ou, em `adicionar_blocos`, o id de um bloco ou moldura que já está no fluxo).',
  );
export type McpLink = z.infer<typeof mcpLinkSchema>;

const flowParts = {
  blocks: z.array(mcpBlockSchema).max(AI_LIMITS.blocks).default([]),
  groups: z.array(mcpGroupSchema).max(AI_LIMITS.groups).default([]),
  links: z.array(mcpLinkSchema).max(AI_LIMITS.links).default([]),
};

/** `criar_fluxo`. */
export const createFlowInputSchema = z
  .object({
    title: projectTitleSchema.default('Sem título'),
    ...flowParts,
  })
  .refine((input) => input.blocks.length > 0, {
    message: 'Informe ao menos um bloco.',
    path: ['blocks'],
  });
export type CreateFlowInput = z.infer<typeof createFlowInputSchema>;

/** `adicionar_blocos`. */
export const addBlocksInputSchema = z
  .object({
    projectId: z.uuid().describe('O id do fluxo (veja `listar_projetos`).'),
    ...flowParts,
  })
  .refine((input) => input.blocks.length > 0 || input.links.length > 0, {
    message: 'Informe blocos novos ou setas para adicionar.',
    path: ['blocks'],
  });
export type AddBlocksInput = z.infer<typeof addBlocksInputSchema>;

interface FlowParts {
  blocks: McpBlock[];
  groups: McpGroup[];
  links: McpLink[];
}

/** Os ids que cada nome (`ref`) virou, para a IA ligar blocos novos nas chamadas seguintes. */
export type McpRefIds = Record<string, string>;

interface BuiltPart {
  /** Só a parte nova, com posições a partir de (0, 0). Vazia quando só há setas. */
  flow: FlowContent;
  refIds: Map<string, string>;
  /** Setas que ligam algo que já existia no fluxo. */
  externalArrows: Arrow[];
}

const emptyFlow = (): FlowContent => ({
  schemaVersion: 1,
  blocks: [],
  frames: [],
  arrows: [],
  presentation: [],
});

function toAiBlock(block: McpBlock, ref: string): AiBlock {
  switch (block.type) {
    case 'text':
      return { type: 'text', ref, text: block.text, style: block.style, color: block.color };
    case 'card':
      return {
        type: 'card',
        ref,
        title: block.title,
        description: block.description?.trim() ? block.description : null,
        tag: block.tag ?? null,
      };
    case 'sticky':
      return { type: 'sticky', ref, text: block.text, color: block.color };
    case 'shape':
      return { type: 'shape', ref, shape: block.shape, text: block.text };
    case 'checklist':
      return { type: 'checklist', ref, title: block.title, items: block.items };
  }
}

/**
 * Confere nomes e ligações e monta a parte nova do fluxo. `existingIds` são os blocos e molduras
 * que já estão no quadro (vazio em `criar_fluxo`): uma seta pode ligar um deles a um bloco novo.
 */
function buildPart(
  parts: FlowParts,
  existingIds: ReadonlySet<string>,
  options: AiFlowOptions,
): BuiltPart {
  const newId = options.newId ?? (() => crypto.randomUUID());
  const used = new Set<string>();
  const claim = (ref: string, what: string) => {
    if (used.has(ref)) {
      throw new McpInputError(
        `O nome "${ref}" aparece mais de uma vez (${what}). Use nomes diferentes.`,
      );
    }
    if (existingIds.has(ref)) {
      throw new McpInputError(
        `O nome "${ref}" é o id de algo que já está no fluxo. Escolha outro nome.`,
      );
    }
    used.add(ref);
  };

  // Primeiro os nomes que a pessoa escolheu; os blocos sem nome ganham "bloco-N" livre.
  parts.blocks.forEach((block) => block.ref && claim(block.ref, 'bloco'));
  parts.groups.forEach((group) => claim(group.ref, 'grupo'));
  let counter = 0;
  const aiBlocks: AiBlock[] = parts.blocks.map((block) => {
    let ref = block.ref;
    if (!ref) {
      do ref = `bloco-${String(++counter)}`;
      while (used.has(ref));
      used.add(ref);
    }
    return toAiBlock(block, ref);
  });
  const blockRefs = new Set(aiBlocks.map((block) => block.ref));

  const grouped = new Set<string>();
  const aiGroups: AiGroup[] = parts.groups.map((group) => {
    for (const ref of group.blockRefs) {
      if (!blockRefs.has(ref)) {
        throw new McpInputError(
          `O grupo "${group.title}" cita o bloco "${ref}", que não existe nesta chamada.`,
        );
      }
      if (grouped.has(ref)) {
        throw new McpInputError(`O bloco "${ref}" está em mais de um grupo.`);
      }
      grouped.add(ref);
    }
    return { ref: group.ref, title: group.title, blockRefs: group.blockRefs };
  });

  const internal: AiLink[] = [];
  const external: McpLink[] = [];
  for (const link of parts.links) {
    for (const end of [link.from, link.to]) {
      if (!used.has(end) && !existingIds.has(end)) {
        throw new McpInputError(
          `A seta aponta para "${end}", que não é um bloco novo nem um id que já está no fluxo.`,
        );
      }
    }
    if (used.has(link.from) && used.has(link.to)) {
      internal.push({ from: link.from, to: link.to, label: link.label ?? null });
    } else {
      external.push(link);
    }
  }

  const refIds = new Map<string, string>();
  const flow =
    aiBlocks.length === 0
      ? emptyFlow()
      : aiOutputToFlow(
          aiFlowOutputSchema.parse({
            title: '',
            blocks: aiBlocks,
            groups: aiGroups,
            links: internal,
            corrections: [],
          } satisfies AiFlowOutput),
          { newId, refIds },
        );

  const externalArrows: Arrow[] = [];
  const seen = new Set<string>();
  for (const link of external) {
    const from = refIds.get(link.from) ?? link.from;
    const to = refIds.get(link.to) ?? link.to;
    const key = `${from}>${to}`;
    if (from === to || seen.has(key)) continue;
    seen.add(key);
    externalArrows.push(
      arrowSchema.parse({
        id: newId(),
        from: { nodeId: from },
        to: { nodeId: to },
        route: 'curved',
        ...(link.label ? { label: clipText(link.label, 200) } : {}),
      }),
    );
  }
  return { flow, refIds, externalArrows };
}

export interface BuiltFlow {
  content: FlowContent;
  refs: McpRefIds;
}

/** `criar_fluxo`: o conteúdo do fluxo novo. Os blocos usam a mesma disposição provisória da IA. */
export function buildFlowFromMcp(input: CreateFlowInput, options: AiFlowOptions = {}): BuiltFlow {
  const built = buildPart(input, new Set(), options);
  return {
    content: flowContentSchema.parse({
      ...built.flow,
      arrows: [...built.flow.arrows, ...built.externalArrows],
    }),
    refs: Object.fromEntries(built.refIds),
  };
}

export interface AppendedFlow extends BuiltFlow {
  added: { blocks: number; frames: number; arrows: number };
}

/** Espaço entre o que já está no quadro e o que chega (múltiplo de 8). */
const APPEND_GAP = 64;

function shift<T extends { position: { x: number; y: number } }>(
  items: readonly T[],
  dx: number,
  dy: number,
): T[] {
  return items.map((item) => ({
    ...item,
    position: { x: item.position.x + dx, y: item.position.y + dy },
  }));
}

/**
 * `adicionar_blocos`: acrescenta blocos, grupos e setas a um fluxo que já existe. O que chega
 * entra embaixo do que já está no quadro, alinhado à esquerda; nada do que existia muda.
 */
export function appendToFlow(
  flow: FlowContent,
  input: Pick<AddBlocksInput, 'blocks' | 'groups' | 'links'>,
  options: AiFlowOptions = {},
): AppendedFlow {
  const existingIds = new Set([
    ...flow.blocks.map((block) => block.id),
    ...flow.frames.map((frame) => frame.id),
  ]);
  const built = buildPart(input, existingIds, options);

  const nodes = [...flow.blocks, ...flow.frames];
  const dx = nodes.length > 0 ? snapToGrid(Math.min(...nodes.map((node) => node.position.x))) : 0;
  const dy =
    nodes.length > 0
      ? Math.ceil(
          (Math.max(...nodes.map((node) => node.position.y + node.size.height)) + APPEND_GAP) /
            GRID_SIZE,
        ) * GRID_SIZE
      : 0;

  const knownArrows = new Set(
    flow.arrows.map((arrow) => `${arrow.from.nodeId}>${arrow.to.nodeId}`),
  );
  const externalArrows = built.externalArrows.filter(
    (arrow) => !knownArrows.has(`${arrow.from.nodeId}>${arrow.to.nodeId}`),
  );

  const blocks = shift(built.flow.blocks, dx, dy);
  const frames = shift(built.flow.frames, dx, dy);
  const arrows = [...built.flow.arrows, ...externalArrows];
  const content = flowContentSchema.parse({
    ...flow,
    blocks: [...flow.blocks, ...blocks],
    frames: [...flow.frames, ...frames],
    arrows: [...flow.arrows, ...arrows],
  });
  return {
    content,
    refs: Object.fromEntries(built.refIds),
    added: { blocks: blocks.length, frames: frames.length, arrows: arrows.length },
  };
}

/* -------------------------------------------------------------------------------------------- */
/* ler_fluxo                                                                                     */
/* -------------------------------------------------------------------------------------------- */

export const readFlowInputSchema = z.object({
  projectId: z.uuid().describe('O id do fluxo (veja `listar_projetos`).'),
  format: z
    .enum(['full', 'summary'])
    .default('full')
    .describe(
      '"full" devolve o fluxo inteiro em JSON; "summary" devolve só uma lista curta de blocos (com os ids), molduras e setas, boa para fluxos grandes.',
    ),
});
export type ReadFlowInput = z.infer<typeof readFlowInputSchema>;

const summaryBlockSchema = z.object({
  id: z.string(),
  type: z.string(),
  /** O texto principal do bloco, cortado em 120 letras. */
  text: z.string(),
  tag: z.string().optional(),
  frameId: z.string().optional(),
  /** Só em cartões com selo de status: o selo está marcado? */
  done: z.boolean().optional(),
  items: z.array(z.object({ id: z.string(), text: z.string(), done: z.boolean() })).optional(),
});

export const mcpFlowSummarySchema = z.object({
  counts: z.object({
    blocks: z.number().int(),
    frames: z.number().int(),
    arrows: z.number().int(),
  }),
  blocks: z.array(summaryBlockSchema),
  frames: z.array(z.object({ id: z.string(), title: z.string() })),
  arrows: z.array(
    z.object({ id: z.string(), from: z.string(), to: z.string(), label: z.string().optional() }),
  ),
});
export type McpFlowSummary = z.infer<typeof mcpFlowSummarySchema>;

function blockText(block: Block): string {
  switch (block.type) {
    case 'text':
    case 'sticky':
    case 'shape':
      return block.text;
    case 'card':
    case 'checklist':
      return block.title;
    case 'link':
      return block.title ?? block.url;
    case 'image':
      return block.caption ?? block.fileName ?? block.src;
    case 'audio':
      return block.transcript ?? 'Áudio';
  }
}

/** Uma lista curta do fluxo: o suficiente para a IA achar um bloco e ligar outro nele. */
export function summarizeFlow(flow: FlowContent): McpFlowSummary {
  return {
    counts: { blocks: flow.blocks.length, frames: flow.frames.length, arrows: flow.arrows.length },
    blocks: flow.blocks.map((block) => ({
      id: block.id,
      type: block.type,
      text: clipText(blockText(block).replace(/\s+/g, ' ').trim(), 120),
      ...(block.type === 'card' && block.tag ? { tag: block.tag } : {}),
      ...(block.frameId ? { frameId: block.frameId } : {}),
      ...(block.type === 'card' && block.status ? { done: block.status.done } : {}),
      ...(block.type === 'checklist'
        ? {
            items: block.items.map((item) => ({
              id: item.id,
              text: clipText(item.text, 120),
              done: item.done,
            })),
          }
        : {}),
    })),
    frames: flow.frames.map((frame) => ({ id: frame.id, title: frame.title })),
    arrows: flow.arrows.map((arrow) => ({
      id: arrow.id,
      from: arrow.from.nodeId,
      to: arrow.to.nodeId,
      ...(arrow.label ? { label: arrow.label } : {}),
    })),
  };
}

/* -------------------------------------------------------------------------------------------- */
/* marcar_concluido                                                                              */
/* -------------------------------------------------------------------------------------------- */

export const markDoneInputSchema = z.object({
  projectId: z.uuid(),
  blockId: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .describe(
      'O id do cartão (marca o selo, como "Vídeo pronto") ou das etapas (marca a lista). Sem ele, marca o projeto inteiro como concluído.',
    ),
  itemId: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .describe('Uma etapa de dentro da lista `blockId`. Sem ela, marca todas as etapas da lista.'),
  done: z.boolean().default(true).describe('false desmarca.'),
});
export type MarkDoneInput = z.infer<typeof markDoneInputSchema>;

export interface MarkedDone {
  content: FlowContent;
  /** O nome do que foi marcado, para a Agenda e a resposta ("Vídeo pronto", "Gravar"). */
  label: string;
}

/**
 * Marca (ou desmarca) o selo de um cartão ou as etapas de uma lista. O selo guarda a hora da
 * marcação (`doneAt`), que alimenta a Agenda.
 */
export function markDoneInFlow(
  flow: FlowContent,
  target: { blockId: string; itemId?: string | undefined; done: boolean },
  now: Date,
): MarkedDone {
  const block = flow.blocks.find((item) => item.id === target.blockId);
  if (!block) {
    throw new McpInputError(
      `Não achei o bloco "${target.blockId}" neste fluxo. Use \`ler_fluxo\` para ver os ids.`,
    );
  }

  const replace = (next: Block): FlowContent =>
    flowContentSchema.parse({
      ...flow,
      blocks: flow.blocks.map((item) => (item.id === block.id ? next : item)),
    });

  if (block.type === 'card') {
    const badge = setBadgeDone(
      block.status ?? { label: DEFAULT_BADGE_LABEL, done: false },
      target.done,
      now,
    );
    const next: CardBlock = { ...block, status: badge };
    return { content: replace(next), label: badge.label };
  }

  if (block.type === 'checklist') {
    if (target.itemId !== undefined && !block.items.some((item) => item.id === target.itemId)) {
      throw new McpInputError(`Não achei a etapa "${target.itemId}" nessa lista.`);
    }
    const next: ChecklistBlock = checklistBlockSchema.parse({
      ...block,
      items: block.items.map((item) =>
        target.itemId === undefined || item.id === target.itemId
          ? { ...item, done: target.done }
          : item,
      ),
    });
    const label =
      target.itemId === undefined
        ? block.title
        : (block.items.find((item) => item.id === target.itemId)?.text ?? block.title);
    return { content: replace(next), label: clipText(label, 120) };
  }

  throw new McpInputError('Só cartões (selo de status) e listas de etapas podem ser marcados.');
}

/* -------------------------------------------------------------------------------------------- */
/* criar_roteiro                                                                                 */
/* -------------------------------------------------------------------------------------------- */

const sceneInput = z.object({
  title: z.string().trim().min(1).max(200),
  time: z.string().trim().max(40).optional().describe('Marcação de tempo, ex.: "0:00–0:15".'),
  narration: z.string().max(20000).optional().describe('A fala: o que é dito na cena.'),
  broll: z
    .array(z.string().trim().min(1).max(500))
    .max(100)
    .optional()
    .describe('Planos de B-roll, um por item.'),
  notes: z.string().max(20000).optional().describe('Direção e anotações da cena.'),
});

/** `criar_roteiro`. */
export const createScriptInputSchema = z.object({
  title: projectTitleSchema,
  targetDuration: z.string().trim().max(40).optional().describe('Duração alvo, ex.: "8–10 min".'),
  scenes: z.array(sceneInput).min(1).max(100),
  linkFlow: z
    .boolean()
    .default(true)
    .describe('true cria também um fluxo com um cartão por cena, ligado ao roteiro.'),
});
export type CreateScriptInput = z.infer<typeof createScriptInputSchema>;

/** Colunas e distâncias do fluxo do roteiro: as mesmas do modelo "Roteiro de vídeo". */
const SCRIPT_COLUMNS = 4;
const SCRIPT_COLUMN_STEP = 336;
const SCRIPT_ROW_STEP = 208;
const SCRIPT_FIRST = { x: 112, y: 128 };

export interface BuiltScript {
  /** O roteiro; `flowId` fica `null` até o fluxo existir (quem grava preenche). */
  script: ScriptContent;
  /** O fluxo com um cartão por cena, ou `null` quando `linkFlow` é falso. */
  flow: FlowContent | null;
  flowTitle: string;
}

/** `criar_roteiro`: o roteiro e, ligado a ele, um fluxo com um cartão por cena. */
export function buildScriptWithFlow(
  input: CreateScriptInput,
  options: { newId?: () => string } = {},
): BuiltScript {
  const newId = options.newId ?? (() => crypto.randomUUID());
  let script = scriptContentSchema.parse({
    scenes: input.scenes.map((scene) =>
      createScene({
        id: newId(),
        title: scene.title,
        time: scene.time ?? '',
        narration: scene.narration ?? '',
        broll: scene.broll ?? [],
        notes: scene.notes ?? '',
      }),
    ),
    ...(input.targetDuration ? { targetDuration: input.targetDuration } : {}),
  });
  const flowTitle = clipText(`${input.title} (fluxo)`, 200);
  if (!input.linkFlow) return { script, flow: null, flowTitle };

  const blocks: Block[] = [
    textBlockSchema.parse({
      id: newId(),
      type: 'text',
      position: { x: SCRIPT_FIRST.x, y: SCRIPT_FIRST.y - 80 },
      size: { width: 640, height: 48 },
      text: clipText(`Roteiro · ${input.title}`, 200),
      font: 'serif',
      fontSize: 24,
      color: 'strong',
      bold: true,
    }),
  ];
  const cardIds: string[] = [];
  script.scenes.forEach((scene, index) => {
    const id = newId();
    cardIds.push(id);
    blocks.push(
      cardFromScene(scene, {
        id,
        index,
        position: {
          x: SCRIPT_FIRST.x + (index % SCRIPT_COLUMNS) * SCRIPT_COLUMN_STEP,
          y: SCRIPT_FIRST.y + Math.floor(index / SCRIPT_COLUMNS) * SCRIPT_ROW_STEP,
        },
      }),
    );
    script = linkSceneToCard(script, scene.id, id);
  });
  const arrows = cardIds.slice(1).map((id, index) =>
    arrowSchema.parse({
      id: newId(),
      from: { nodeId: cardIds[index] },
      to: { nodeId: id },
      route: 'curved',
    }),
  );
  const flow = flowContentSchema.parse({
    schemaVersion: 1,
    blocks,
    frames: [],
    arrows,
    presentation: [],
  });
  return { script: scriptContentSchema.parse(script), flow, flowTitle };
}

/* -------------------------------------------------------------------------------------------- */
/* registrar_estudo                                                                              */
/* -------------------------------------------------------------------------------------------- */

/** `registrar_estudo`. */
export const studyInputSchema = z
  .object({
    notebookId: z
      .uuid()
      .optional()
      .describe('O id do caderno (veja `listar_projetos`, tipo "notebook").'),
    notebookTitle: projectTitleSchema
      .optional()
      .describe('O nome do caderno. Se não existir, o Trama cria um caderno com esse nome.'),
    title: lessonTitleSchema.describe('O nome da aula.'),
    notes: lessonNotesSchema.optional().describe('Anotações da aula.'),
    studiedAt: dateTimeSchema
      .optional()
      .describe(
        'Quando estudou (data e hora com fuso). Sem isto, vale agora. Não pode ser no futuro.',
      ),
    reviewOn: dateKeySchema
      .optional()
      .describe('Dia da revisão (AAAA-MM-DD). Sem isto, vale o intervalo do caderno (7 dias).'),
  })
  .refine((input) => input.notebookId !== undefined || input.notebookTitle !== undefined, {
    message: 'Informe o caderno: `notebookId` ou `notebookTitle`.',
    path: ['notebookId'],
  });
export type StudyInput = z.infer<typeof studyInputSchema>;

/**
 * A aula pronta para gravar: "Feito", com a data de estudo e a de revisão. O banco registra o
 * evento "Aula estudada" na Agenda sozinho, na hora do estudo.
 */
export function buildLessonRequest(
  input: StudyInput,
  context: { now: Date; reviewAfterDays: number; timeZone?: string },
): CreateLessonRequest {
  const timeZone = context.timeZone ?? DEFAULT_TIME_ZONE;
  const studiedAt = input.studiedAt ?? context.now.toISOString();
  if (isFutureNote(studiedAt, context.now)) {
    throw new McpInputError('A data do estudo não pode ser no futuro.');
  }
  return {
    title: input.title,
    ...(input.notes === undefined ? {} : { notes: input.notes }),
    status: 'done',
    studiedAt,
    reviewOn: input.reviewOn ?? nextReviewDate(studiedAt, context.reviewAfterDays, timeZone),
  };
}

/* -------------------------------------------------------------------------------------------- */
/* buscar_agenda                                                                                 */
/* -------------------------------------------------------------------------------------------- */

export const agendaPeriodSchema = z.enum(['day', 'week', 'month']);
export type AgendaPeriod = z.infer<typeof agendaPeriodSchema>;

export const agendaInputSchema = z.object({
  period: agendaPeriodSchema
    .default('day')
    .describe('"day" é o dia; "week" a semana (de domingo a sábado) e "month" o mês do dia dado.'),
  date: dateKeySchema.optional().describe('Um dia dentro do período (AAAA-MM-DD). Sem isto, hoje.'),
});
export type AgendaInput = z.infer<typeof agendaInputSchema>;

/** O intervalo de tempo da consulta (início incluído, fim excluído) no fuso da pessoa. */
export function agendaWindow(
  input: AgendaInput,
  now: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): InstantRange & { fromDate: DateKey; toDate: DateKey } {
  const day = input.date ?? todayKey(now, timeZone);
  let fromDate: DateKey;
  let toDate: DateKey;
  if (input.period === 'day') {
    fromDate = day;
    toDate = addDays(day, 1);
  } else if (input.period === 'week') {
    fromDate = addDays(day, -weekdayOf(day));
    toDate = addDays(fromDate, 7);
  } else {
    const { year, month } = parseDateKey(day);
    fromDate = formatDateKey(year, month, 1);
    toDate = month === 12 ? formatDateKey(year + 1, 1, 1) : formatDateKey(year, month + 1, 1);
  }
  return {
    from: zonedInstant(fromDate, 0, 0, timeZone).toISOString(),
    to: zonedInstant(toDate, 0, 0, timeZone).toISOString(),
    fromDate,
    toDate: addDays(toDate, -1),
  };
}

export const agendaEntrySchema = z.object({
  time: z.string(),
  label: z.string(),
  title: z.string(),
  detail: z.string().nullable(),
  projectId: z.uuid().nullable(),
  projectKind: projectKindSchema.nullable(),
});

export const agendaDaySchema = z.object({
  date: dateKeySchema,
  events: z.array(agendaEntrySchema),
});

export const agendaOutputSchema = z.object({
  period: agendaPeriodSchema,
  /** Primeiro e último dia do período, no fuso da pessoa. */
  from: dateKeySchema,
  to: dateKeySchema,
  timeZone: z.string(),
  total: z.number().int().nonnegative(),
  days: z.array(agendaDaySchema),
});
export type AgendaOutput = z.infer<typeof agendaOutputSchema>;

/** Os eventos do período, dia a dia, do mais antigo ao mais novo. */
export function summarizeAgenda(
  events: readonly AgendaEvent[],
  window: { fromDate: DateKey; toDate: DateKey },
  period: AgendaPeriod,
  timeZone: string = DEFAULT_TIME_ZONE,
): AgendaOutput {
  const byDay = new Map<DateKey, AgendaOutput['days'][number]['events']>();
  const sorted = [...events].sort(
    (a, b) =>
      new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime() ||
      a.id.localeCompare(b.id),
  );
  for (const event of sorted) {
    const date = localDateKey(event.occurredAt, timeZone);
    const list = byDay.get(date) ?? [];
    list.push({
      time: localTime(event.occurredAt, timeZone),
      label: eventLabel(event),
      title: event.title,
      detail: event.detail,
      projectId: event.projectId,
      projectKind: event.projectKind,
    });
    byDay.set(date, list);
  }
  return {
    period,
    from: window.fromDate,
    to: window.toDate,
    timeZone,
    total: events.length,
    days: [...byDay.entries()].map(([date, list]) => ({ date, events: list })),
  };
}

/* -------------------------------------------------------------------------------------------- */
/* listar_projetos                                                                               */
/* -------------------------------------------------------------------------------------------- */

export const MCP_LIST_DEFAULT_LIMIT = 50;
export const MCP_LIST_MAX_LIMIT = 200;

export const listProjectsInputSchema = z.object({
  kind: projectKindSchema
    .optional()
    .describe('"flow" (fluxo), "script" (roteiro) ou "notebook" (caderno).'),
  status: projectStatusSchema.optional(),
  search: z.string().trim().min(1).max(100).optional().describe('Parte do título.'),
  updatedFrom: dateKeySchema.optional().describe('Só o que mudou a partir deste dia (AAAA-MM-DD).'),
  updatedTo: dateKeySchema.optional().describe('Só o que mudou até este dia, inclusive.'),
  limit: z.number().int().min(1).max(MCP_LIST_MAX_LIMIT).default(MCP_LIST_DEFAULT_LIMIT),
});
export type ListProjectsInput = z.infer<typeof listProjectsInputSchema>;

/** Tira do texto os acentos e as maiúsculas, para a busca achar "Edição" digitando "edicao". */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Filtra a lista da API (que vem do mais novo ao mais antigo) e corta no limite. */
export function filterProjects(
  projects: readonly ProjectSummary[],
  input: ListProjectsInput,
  timeZone: string = DEFAULT_TIME_ZONE,
): { projects: ProjectSummary[]; total: number } {
  const needle = input.search ? fold(input.search) : null;
  const matches = projects.filter((project) => {
    if (input.kind && project.kind !== input.kind) return false;
    if (input.status && project.status !== input.status) return false;
    if (needle && !fold(project.title).includes(needle)) return false;
    const day = localDateKey(project.updatedAt, timeZone);
    if (input.updatedFrom && day < input.updatedFrom) return false;
    if (input.updatedTo && day > input.updatedTo) return false;
    return true;
  });
  return { projects: matches.slice(0, input.limit), total: matches.length };
}

/* -------------------------------------------------------------------------------------------- */
/* organizar_texto                                                                               */
/* -------------------------------------------------------------------------------------------- */

/** `organizar_texto`: o mesmo pedido do "Falar e organizar", mais a opção de já criar o fluxo. */
export const organizeInputSchema = aiOrganizeRequestSchema.extend({
  saveAsFlow: z
    .boolean()
    .default(false)
    .describe('true cria um fluxo com o resultado (só nos formatos "flow" e "plan").'),
});
export type OrganizeInput = z.infer<typeof organizeInputSchema>;

/** O fluxo que sai do resultado da IA, ou `null` no formato "prompt" (que não vira quadro). */
export function organizedToFlow(
  response: AiOrganizeResponse,
  options: AiFlowOptions = {},
): { title: string; content: FlowContent } | null {
  if (response.format === 'prompt') return null;
  return {
    title: aiSuggestedTitle(response.output.title),
    content: aiOutputToFlow(response.output, options),
  };
}

/* -------------------------------------------------------------------------------------------- */
/* Saídas                                                                                        */
/* -------------------------------------------------------------------------------------------- */

/** Um projeto citado na resposta: o id, o nome e o endereço no site. */
export const mcpProjectRefSchema = z.object({
  id: z.uuid(),
  kind: projectKindSchema,
  title: z.string(),
  url: z.string(),
  revision: z.number().int().positive().optional(),
});
export type McpProjectRef = z.infer<typeof mcpProjectRefSchema>;

export const listProjectsOutputSchema = z.object({
  /** Quantos projetos batem com o filtro (pode passar do `limit`). */
  total: z.number().int().nonnegative(),
  projects: z.array(projectSummarySchema.extend({ url: z.string() })),
});

export const readFlowOutputSchema = z.object({
  project: projectSummarySchema.extend({ url: z.string() }),
  content: flowContentSchema.optional(),
  summary: mcpFlowSummarySchema.optional(),
});

const refIdsSchema = z
  .record(z.string(), z.string())
  .describe('O id de cada bloco ou grupo criado, pelo nome (`ref`) que a chamada deu.');

export const createFlowOutputSchema = z.object({
  project: mcpProjectRefSchema,
  counts: z.object({
    blocks: z.number().int(),
    frames: z.number().int(),
    arrows: z.number().int(),
  }),
  refs: refIdsSchema,
});

export const addBlocksOutputSchema = z.object({
  project: mcpProjectRefSchema,
  added: z.object({ blocks: z.number().int(), frames: z.number().int(), arrows: z.number().int() }),
  refs: refIdsSchema,
});

export const markDoneOutputSchema = z.object({
  project: mcpProjectRefSchema,
  /** O que foi marcado (o selo, a lista ou o projeto). */
  label: z.string(),
  done: z.boolean(),
  status: projectStatusSchema.optional(),
});

export const organizeOutputSchema = z.object({
  result: aiOrganizeResponseSchema,
  /** No formato "prompt": o texto pronto para copiar. */
  promptText: z.string().optional(),
  project: mcpProjectRefSchema.nullable(),
});

export const createScriptOutputSchema = z.object({
  script: mcpProjectRefSchema,
  flow: mcpProjectRefSchema.nullable(),
  scenes: z.number().int().nonnegative(),
});

export const studyOutputSchema = z.object({
  notebook: mcpProjectRefSchema,
  notebookCreated: z.boolean(),
  lesson: lessonSchema,
});
export type StudyOutput = { notebook: McpProjectRef; notebookCreated: boolean; lesson: Lesson };

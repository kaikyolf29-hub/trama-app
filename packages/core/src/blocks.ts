import { z } from 'zod';
import { idSchema, pointSchema, sizeSchema } from './geometry';
import { statusBadgeSchema } from './status';

/**
 * Cores e fontes são nomes de token, nunca hex. O valor de cada token fica em
 * packages/ui/tokens.ts (docs/PLAN.md, "Tokens de design").
 */
export const textFontSchema = z.enum(['sans', 'serif', 'mono', 'hand']);
export type TextFont = z.infer<typeof textFontSchema>;

export const textFontLabels: Record<TextFont, string> = {
  sans: 'Padrão',
  serif: 'Serifa',
  mono: 'Mono',
  hand: 'Manuscrita',
};

/** As quatro cores das notas adesivas (Notion escuro). */
export const noteColorSchema = z.enum(['yellow', 'blue', 'green', 'pink']);
export type NoteColor = z.infer<typeof noteColorSchema>;

/** Cor do texto: os três tons de texto ou uma das cores de nota. */
export const textColorSchema = z.enum(['strong', 'normal', 'muted', ...noteColorSchema.options]);
export type TextColor = z.infer<typeof textColorSchema>;

export const shapeKindSchema = z.enum(['rectangle', 'ellipse', 'diamond']);
export type ShapeKind = z.infer<typeof shapeKindSchema>;

/** Campos comuns a todo bloco. A posição é sempre absoluta no quadro. */
const blockBase = {
  id: idSchema,
  position: pointSchema,
  size: sizeSchema,
  /** Moldura que contém o bloco, se houver. */
  frameId: idSchema.optional(),
  /** Travado: não se move nem muda de tamanho. */
  locked: z.boolean().default(false),
  /** Ordem de empilhamento; maior fica na frente. Empate: a ordem da lista decide. */
  zIndex: z.number().int().default(0),
};

/**
 * Texto (tecla T). `text` é texto simples; linhas começando com "- " ou "1. "
 * são listas. Fonte, tamanho, cor, negrito e itálico valem para o bloco todo.
 */
export const textBlockSchema = z.object({
  ...blockBase,
  type: z.literal('text'),
  text: z.string().default(''),
  font: textFontSchema.default('sans'),
  fontSize: z.number().int().min(8).max(160).default(16),
  color: textColorSchema.default('normal'),
  bold: z.boolean().default(false),
  italic: z.boolean().default(false),
});

/** Cartão (tecla C): título, descrição, etiqueta e o selo de status (ex.: "Vídeo pronto"). */
export const cardBlockSchema = z.object({
  ...blockBase,
  type: z.literal('card'),
  title: z.string().max(200).default(''),
  description: z.string().optional(),
  /** Etiqueta curta acima do título, ex.: "Projeto". */
  tag: z.string().max(40).optional(),
  status: statusBadgeSchema.optional(),
});

/** Nota adesiva (tecla N). */
export const stickyBlockSchema = z.object({
  ...blockBase,
  type: z.literal('sticky'),
  text: z.string().default(''),
  color: noteColorSchema.default('yellow'),
});

/** Forma (tecla R): retângulo, círculo ou losango, com texto dentro. */
export const shapeBlockSchema = z.object({
  ...blockBase,
  type: z.literal('shape'),
  shape: shapeKindSchema.default('rectangle'),
  text: z.string().default(''),
});

/** Recorte da imagem em frações (0 a 1) do tamanho original. */
export const imageCropSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().gt(0).max(1),
    height: z.number().gt(0).max(1),
  })
  .refine((crop) => crop.x + crop.width <= 1 + 1e-9 && crop.y + crop.height <= 1 + 1e-9, {
    message: 'o recorte precisa caber dentro da imagem',
  });

/** Imagem: arrastar, colar ou botão. É onde entra a thumbnail pronta. */
export const imageBlockSchema = z.object({
  ...blockBase,
  type: z.literal('image'),
  /** URL ou caminho no Storage/Drive. Quem resolve o endereço final é o app. */
  src: z.string().min(1),
  /** Nome do arquivo, ex.: thumbnail-final.png. */
  fileName: z.string().max(255).optional(),
  caption: z.string().max(500).optional(),
  /** Tamanho original em px, usado no "tamanho original". */
  naturalSize: sizeSchema.optional(),
  crop: imageCropSchema.optional(),
});

/**
 * Vídeo ou link (colar o link). Se é YouTube/Vimeo ou outro site é derivado do
 * `url` com parseLinkEmbed, para não guardar a mesma informação duas vezes.
 */
export const linkBlockSchema = z.object({
  ...blockBase,
  type: z.literal('link'),
  url: z.url({ protocol: /^https?$/ }),
  title: z.string().max(300).optional(),
  description: z.string().max(1000).optional(),
  thumbnailUrl: z.url({ protocol: /^https?$/ }).optional(),
  durationSeconds: z.number().nonnegative().optional(),
});

export const checklistItemSchema = z.object({
  id: idSchema,
  text: z.string().max(500).default(''),
  done: z.boolean().default(false),
});

/** Etapas: lista com marcar e contador (5/5). */
export const checklistBlockSchema = z
  .object({
    ...blockBase,
    type: z.literal('checklist'),
    title: z.string().max(80).default('Etapas'),
    items: z.array(checklistItemSchema).default([]),
  })
  .superRefine((block, ctx) => {
    const seen = new Set<string>();
    block.items.forEach((item, index) => {
      if (seen.has(item.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `id de etapa repetido: ${item.id}`,
          path: ['items', index, 'id'],
        });
      }
      seen.add(item.id);
    });
  });

/** Áudio gravado pela ferramenta de voz: toca e mostra a transcrição. */
export const audioBlockSchema = z.object({
  ...blockBase,
  type: z.literal('audio'),
  src: z.string().min(1),
  durationSeconds: z.number().nonnegative().optional(),
  transcript: z.string().optional(),
});

export const blockSchema = z.discriminatedUnion('type', [
  textBlockSchema,
  cardBlockSchema,
  stickyBlockSchema,
  shapeBlockSchema,
  imageBlockSchema,
  linkBlockSchema,
  checklistBlockSchema,
  audioBlockSchema,
]);

export type Block = z.infer<typeof blockSchema>;
/** Formato aceito na entrada (campos com padrão podem faltar). */
export type BlockInput = z.input<typeof blockSchema>;
export type BlockType = Block['type'];
export type TextBlock = z.infer<typeof textBlockSchema>;
export type CardBlock = z.infer<typeof cardBlockSchema>;
export type StickyBlock = z.infer<typeof stickyBlockSchema>;
export type ShapeBlock = z.infer<typeof shapeBlockSchema>;
export type ImageBlock = z.infer<typeof imageBlockSchema>;
export type ImageCrop = z.infer<typeof imageCropSchema>;
export type LinkBlock = z.infer<typeof linkBlockSchema>;
export type ChecklistBlock = z.infer<typeof checklistBlockSchema>;
export type ChecklistItem = z.infer<typeof checklistItemSchema>;
export type AudioBlock = z.infer<typeof audioBlockSchema>;

export const blockTypes = blockSchema.options.map((option) => option.shape.type.value);

export interface ChecklistProgress {
  done: number;
  total: number;
  /** true quando há etapas e todas estão marcadas. */
  complete: boolean;
}

/** Contador das etapas, como o "5/5" da tela 1. */
export function checklistProgress(
  items: readonly Pick<ChecklistItem, 'done'>[],
): ChecklistProgress {
  const done = items.filter((item) => item.done).length;
  return { done, total: items.length, complete: items.length > 0 && done === items.length };
}

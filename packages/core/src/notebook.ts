import { z } from 'zod';
import { noteColorSchema } from './blocks';
import { addDays, localDateKey, DEFAULT_TIME_ZONE, dateKeySchema, type DateKey } from './calendar';
import { dateTimeSchema } from './status';

/**
 * Conteúdo de um caderno de Estudos (`kind: 'notebook'`, tela 6). O caderno em si só tem
 * descrição, cor e o intervalo de revisão; as aulas ficam na tabela `lessons` (`lessonSchema`),
 * para a tabela "Todas as aulas" e a Agenda lerem sem abrir cada caderno.
 */
export const NOTEBOOK_SCHEMA_VERSION = 1;

/** Dias entre estudar uma aula e revisá-la, quando o caderno não diz outra coisa. */
export const DEFAULT_REVIEW_AFTER_DAYS = 7;

export const notebookContentSchema = z.object({
  schemaVersion: z.literal(NOTEBOOK_SCHEMA_VERSION).default(NOTEBOOK_SCHEMA_VERSION),
  description: z.string().trim().max(2000).default(''),
  /** Cor do cartão do caderno (nome de token das notas: azul, verde, amarelo ou rosa). */
  color: noteColorSchema.default('blue'),
  /** Dias entre estudar e revisar. */
  reviewAfterDays: z.number().int().min(1).max(365).default(DEFAULT_REVIEW_AFTER_DAYS),
});

export type NotebookContent = z.infer<typeof notebookContentSchema>;
export type NotebookContentInput = z.input<typeof notebookContentSchema>;

/** Caderno vazio: é o que vale quando o conteúdo gravado é `{}`. */
export function createEmptyNotebook(): NotebookContent {
  return notebookContentSchema.parse({});
}

/** Estudando, para revisar ou feito (os três selos da tela 6). */
export const lessonStatusSchema = z.enum(['studying', 'review', 'done']);
export type LessonStatus = z.infer<typeof lessonStatusSchema>;

export const lessonStatusLabels: Record<LessonStatus, string> = {
  studying: 'Estudando',
  review: 'Revisar',
  done: 'Feito',
};

export const lessonTitleSchema = z.string().trim().min(1).max(200);
export const lessonNotesSchema = z.string().max(20000);

/** Aula de um caderno, espelhando a tabela `lessons`. */
export const lessonSchema = z.object({
  id: z.uuid(),
  /** O projeto do tipo caderno a que a aula pertence. */
  notebookId: z.uuid(),
  title: lessonTitleSchema,
  notes: lessonNotesSchema.default(''),
  status: lessonStatusSchema.default('studying'),
  /** Quando estudou (data e hora, a coluna "Estudado em"). */
  studiedAt: dateTimeSchema.nullable().default(null),
  /** Quando revisou pela última vez. */
  reviewedAt: dateTimeSchema.nullable().default(null),
  /** Dia da próxima revisão (a coluna "Revisar em"); sem hora. */
  reviewOn: dateKeySchema.nullable().default(null),
  /** Ordem dentro do caderno, de 0 em diante. */
  position: z.number().int().min(0).default(0),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

export type Lesson = z.infer<typeof lessonSchema>;

/** Dia da próxima revisão: o dia (no fuso) de `from` mais `days`. */
export function nextReviewDate(
  from: Date | string,
  days: number = DEFAULT_REVIEW_AFTER_DAYS,
  timeZone: string = DEFAULT_TIME_ZONE,
): DateKey {
  return addDays(localDateKey(from, timeZone), days);
}

/** Campos que mudam ao marcar uma aula como estudada ou revisada (vão num PATCH). */
export interface LessonProgressPatch {
  status: LessonStatus;
  studiedAt?: string;
  reviewedAt?: string;
  reviewOn: DateKey;
}

/** Estudou agora: fica "Feito" e a revisão marca para daqui a `reviewAfterDays` dias. */
export function markStudied(
  now: Date,
  reviewAfterDays: number = DEFAULT_REVIEW_AFTER_DAYS,
  timeZone: string = DEFAULT_TIME_ZONE,
): LessonProgressPatch {
  return {
    status: 'done',
    studiedAt: now.toISOString(),
    reviewOn: nextReviewDate(now, reviewAfterDays, timeZone),
  };
}

/** Revisou agora: fica "Feito" e a próxima revisão marca para daqui a `reviewAfterDays` dias. */
export function markReviewed(
  now: Date,
  reviewAfterDays: number = DEFAULT_REVIEW_AFTER_DAYS,
  timeZone: string = DEFAULT_TIME_ZONE,
): LessonProgressPatch {
  return {
    status: 'done',
    reviewedAt: now.toISOString(),
    reviewOn: nextReviewDate(now, reviewAfterDays, timeZone),
  };
}

type ReviewFields = Pick<Lesson, 'status' | 'reviewOn'>;

/**
 * A aula já passou do dia da revisão? Quem ainda está estudando não entra; quem está "Feito"
 * com a data de revisão de hoje (ou antes) volta a "Revisar" sozinho, como na tela 6.
 */
export function lessonNeedsReview(lesson: ReviewFields, today: DateKey): boolean {
  if (lesson.status === 'review') return true;
  return lesson.status === 'done' && lesson.reviewOn !== null && lesson.reviewOn <= today;
}

/** O selo que a tabela mostra: o guardado, ou "Revisar" quando a data chegou. */
export function displayStatus(lesson: ReviewFields, today: DateKey): LessonStatus {
  return lessonNeedsReview(lesson, today) ? 'review' : lesson.status;
}

/** Da primeira à última, na ordem do caderno; empate pela data de criação. */
export function sortLessons<T extends Pick<Lesson, 'position' | 'createdAt' | 'id'>>(
  lessons: readonly T[],
): T[] {
  return [...lessons].sort(
    (a, b) =>
      a.position - b.position ||
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
      a.id.localeCompare(b.id),
  );
}

export interface NotebookSummary {
  total: number;
  /** Aulas para revisar hoje ou antes. */
  toReview: number;
  /** Aulas já estudadas (feitas ou para revisar). */
  studied: number;
  /** 0 a 1: a parte já estudada (a barra do cartão do caderno). */
  progress: number;
}

/** Os números do cartão do caderno: "12 aulas · 3 para revisar". */
export function summarizeLessons(
  lessons: readonly ReviewFields[],
  today: DateKey,
): NotebookSummary {
  const total = lessons.length;
  const toReview = lessons.filter((lesson) => lessonNeedsReview(lesson, today)).length;
  const studied = lessons.filter((lesson) => lesson.status !== 'studying').length;
  return { total, toReview, studied, progress: total === 0 ? 0 : studied / total };
}

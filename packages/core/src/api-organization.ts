import { z } from 'zod';
import { eventDetailSchema, eventSchema, eventTitleSchema } from './agenda';
import { dateKeySchema } from './calendar';
import { noteColorSchema } from './blocks';
import {
  lessonNotesSchema,
  lessonSchema,
  lessonStatusSchema,
  lessonTitleSchema,
  notebookContentSchema,
  notebookDescriptionSchema,
  reviewAfterDaysSchema,
} from './notebook';
import { notebookProjectSchema, projectTitleSchema } from './project';
import { dateTimeSchema } from './status';

/**
 * Contrato da API da Agenda (`/events`) e das aulas dos cadernos (`/notebooks/:id/lessons`),
 * usado pelo site e, depois, pelo MCP. Mesma regra de `api.ts`: validar dos dois lados.
 */

/** O maior intervalo de uma consulta: um ano bissexto e uma folga para o fuso. */
export const MAX_EVENT_RANGE_DAYS = 400;
/** A API devolve no máximo isto por consulta (o ano de uma pessoa muito ativa cabe com folga). */
export const MAX_EVENTS_PER_QUERY = 5000;

/** `GET /events?from=...&to=...`: eventos de `from` (incluído) até `to` (excluído). */
export const listEventsQuerySchema = z
  .object({ from: dateTimeSchema, to: dateTimeSchema })
  .superRefine((query, ctx) => {
    const from = new Date(query.from).getTime();
    const to = new Date(query.to).getTime();
    if (!(from < to)) {
      ctx.addIssue({ code: 'custom', message: '`from` precisa vir antes de `to`', path: ['to'] });
    } else if (to - from > MAX_EVENT_RANGE_DAYS * 24 * 60 * 60 * 1000) {
      ctx.addIssue({
        code: 'custom',
        message: `o intervalo passa de ${MAX_EVENT_RANGE_DAYS} dias`,
        path: ['to'],
      });
    }
  });

/**
 * `POST /events`: anotação feita à mão ("Registrar algo"). Sem `occurredAt`, vale agora; com ele,
 * pode ser do passado (nunca do futuro: a API recusa). Os eventos automáticos o banco grava.
 */
export const createNoteRequestSchema = z.object({
  title: eventTitleSchema,
  detail: eventDetailSchema.optional(),
  occurredAt: dateTimeSchema.optional(),
  /** Projeto a que a anotação se refere, se houver. */
  projectId: z.uuid().optional(),
});

export const eventListSchema = z.array(eventSchema);

/** `POST /notebooks/:id/lessons`. */
export const createLessonRequestSchema = z.object({
  title: lessonTitleSchema,
  notes: lessonNotesSchema.optional(),
  status: lessonStatusSchema.optional(),
  studiedAt: dateTimeSchema.nullable().optional(),
  reviewedAt: dateTimeSchema.nullable().optional(),
  reviewOn: dateKeySchema.nullable().optional(),
  /** Sem posição, a aula vai para o fim do caderno. */
  position: z.number().int().min(0).optional(),
});

/**
 * `PATCH /notebooks/:id/lessons/:lessonId`: só o que mudou; `null` limpa uma data. Marcar como
 * estudada ou revisada é mandar `studiedAt` ou `reviewedAt` (veja `markStudied` e `markReviewed`):
 * o banco grava o evento da Agenda sozinho.
 */
export const updateLessonRequestSchema = createLessonRequestSchema
  .partial()
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'informe ao menos um campo',
  });

export const lessonListSchema = z.array(lessonSchema);

/**
 * `POST /notebooks`: cria um caderno de Estudos (projeto do tipo `notebook`). Sem conteúdo, vale
 * o caderno vazio (cor azul, revisão em 7 dias). As aulas entram depois, em `/notebooks/:id/lessons`.
 */
export const createNotebookRequestSchema = z.object({
  title: projectTitleSchema.default('Sem título'),
  content: notebookContentSchema.partial().optional(),
});

/**
 * `PATCH /notebooks/:id`: renomeia o caderno ou muda a descrição, a cor e o intervalo de
 * revisão. Só o que mudou; ao menos um campo.
 */
export const updateNotebookRequestSchema = z
  .object({
    title: projectTitleSchema.optional(),
    description: notebookDescriptionSchema.optional(),
    color: noteColorSchema.optional(),
    reviewAfterDays: reviewAfterDaysSchema.optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'informe ao menos um campo',
  });

/** `GET /notebooks`: os cadernos da pessoa, com o conteúdo (cor, descrição, intervalo). */
export const notebookListSchema = z.array(notebookProjectSchema);

export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;
export type CreateNoteRequest = z.infer<typeof createNoteRequestSchema>;
export type CreateLessonRequest = z.infer<typeof createLessonRequestSchema>;
export type UpdateLessonRequest = z.infer<typeof updateLessonRequestSchema>;
export type CreateNotebookRequest = z.input<typeof createNotebookRequestSchema>;
export type UpdateNotebookRequest = z.infer<typeof updateNotebookRequestSchema>;

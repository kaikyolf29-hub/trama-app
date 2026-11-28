import {
  createLessonRequestSchema,
  createNoteRequestSchema,
  eventListSchema,
  isFutureNote,
  lessonListSchema,
  lessonSchema,
  listEventsQuerySchema,
  eventSchema,
  updateLessonRequestSchema,
} from '@trama/core';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { OrganizationStore } from './store';

const idSchema = z.uuid();

type Variables = { organization: OrganizationStore };
type Ctx = Context<{ Variables: Variables }>;

/** Lê o corpo em JSON; corpo quebrado vira undefined (e a validação recusa). */
async function body(c: Ctx): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

const invalid = (c: Ctx, message: string) => c.json({ error: message }, 400);

const EVENT_NOT_FOUND = 'Evento não encontrado.';
const PROJECT_NOT_FOUND = 'Projeto não encontrado.';
const NOTEBOOK_NOT_FOUND = 'Caderno não encontrado.';
const LESSON_NOT_FOUND = 'Aula não encontrada.';

/**
 * Rotas da Agenda (docs/PLAN.md, etapa 2.2). Os eventos automáticos o banco grava; aqui se lê
 * por intervalo e se cria ou apaga a anotação feita à mão. O que sai é validado de novo.
 */
export function eventRoutes() {
  const routes = new Hono<{ Variables: Variables }>();

  routes.get('/', async (c) => {
    const query = listEventsQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return invalid(c, 'Informe `from` e `to` (data e hora com fuso), com no máximo 400 dias.');
    }
    return c.json(eventListSchema.parse(await c.var.organization.list(query.data)));
  });

  routes.post('/', async (c) => {
    const parsed = createNoteRequestSchema.safeParse(await body(c));
    if (!parsed.success) return invalid(c, 'Dados da anotação inválidos.');
    const { title, detail, projectId } = parsed.data;
    const occurredAt = parsed.data.occurredAt ?? new Date().toISOString();
    if (isFutureNote(occurredAt)) {
      return invalid(c, 'A data da anotação não pode ser no futuro.');
    }
    const event = await c.var.organization.createNote({ title, detail, occurredAt, projectId });
    if (!event) return c.json({ error: PROJECT_NOT_FOUND }, 404);
    return c.json(eventSchema.parse(event), 201);
  });

  routes.delete('/:id', async (c) => {
    const id = idSchema.safeParse(c.req.param('id'));
    const result = id.success ? await c.var.organization.remove(id.data) : 'not_found';
    if (result === 'not_found') return c.json({ error: EVENT_NOT_FOUND }, 404);
    if (result === 'not_manual') {
      return c.json({ error: 'Só anotações feitas à mão podem ser apagadas.' }, 403);
    }
    return c.body(null, 204);
  });

  return routes;
}

/** Rotas das aulas de um caderno: `/notebooks/:id/lessons`. */
export function lessonRoutes() {
  const routes = new Hono<{ Variables: Variables }>();

  routes.get('/:id/lessons', async (c) => {
    const id = idSchema.safeParse(c.req.param('id'));
    const lessons = id.success ? await c.var.organization.lessons.list(id.data) : null;
    if (!lessons) return c.json({ error: NOTEBOOK_NOT_FOUND }, 404);
    return c.json(lessonListSchema.parse(lessons));
  });

  routes.post('/:id/lessons', async (c) => {
    const id = idSchema.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: NOTEBOOK_NOT_FOUND }, 404);
    const parsed = createLessonRequestSchema.safeParse(await body(c));
    if (!parsed.success) return invalid(c, 'Dados da aula inválidos.');
    const lesson = await c.var.organization.lessons.create(id.data, parsed.data);
    if (!lesson) return c.json({ error: NOTEBOOK_NOT_FOUND }, 404);
    return c.json(lessonSchema.parse(lesson), 201);
  });

  routes.patch('/:id/lessons/:lessonId', async (c) => {
    const id = idSchema.safeParse(c.req.param('id'));
    const lessonId = idSchema.safeParse(c.req.param('lessonId'));
    if (!id.success || !lessonId.success) return c.json({ error: LESSON_NOT_FOUND }, 404);
    const parsed = updateLessonRequestSchema.safeParse(await body(c));
    if (!parsed.success) return invalid(c, 'Dados da aula inválidos.');
    const lesson = await c.var.organization.lessons.update(id.data, lessonId.data, parsed.data);
    if (!lesson) return c.json({ error: LESSON_NOT_FOUND }, 404);
    return c.json(lessonSchema.parse(lesson));
  });

  routes.delete('/:id/lessons/:lessonId', async (c) => {
    const id = idSchema.safeParse(c.req.param('id'));
    const lessonId = idSchema.safeParse(c.req.param('lessonId'));
    const removed =
      id.success && lessonId.success
        ? await c.var.organization.lessons.remove(id.data, lessonId.data)
        : false;
    if (!removed) return c.json({ error: LESSON_NOT_FOUND }, 404);
    return c.body(null, 204);
  });

  return routes;
}

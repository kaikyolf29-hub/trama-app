import {
  lessonListSchema,
  lessonSchema,
  type CreateLessonRequest,
  type Lesson,
  type UpdateLessonRequest,
} from '@trama/core';
import { z } from 'zod';
import { createCaller } from './http';

/** O que a tela Estudos usa da API (rotas `/notebooks/:id/lessons`). */
export interface LessonsApi {
  list(notebookId: string): Promise<Lesson[]>;
  create(notebookId: string, input: CreateLessonRequest): Promise<Lesson>;
  /** Só o que mudou; `null` limpa uma data. Estudar e revisar entram na Agenda sozinhos. */
  update(notebookId: string, lessonId: string, patch: UpdateLessonRequest): Promise<Lesson>;
  remove(notebookId: string, lessonId: string): Promise<void>;
}

const base = (notebookId: string) => `/notebooks/${encodeURIComponent(notebookId)}/lessons`;

/** Cliente das aulas dos cadernos. Toda resposta passa pelos esquemas do `@trama/core`. */
export function createLessonsApi(config: Parameters<typeof createCaller>[0]): LessonsApi {
  const call = createCaller(config);

  return {
    list: (notebookId) => call(base(notebookId), lessonListSchema),
    create: (notebookId, input) =>
      call(base(notebookId), lessonSchema, { method: 'POST', body: JSON.stringify(input) }),
    update: (notebookId, lessonId, patch) =>
      call(`${base(notebookId)}/${encodeURIComponent(lessonId)}`, lessonSchema, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    remove: (notebookId, lessonId) =>
      call(`${base(notebookId)}/${encodeURIComponent(lessonId)}`, z.undefined(), {
        method: 'DELETE',
      }),
  };
}

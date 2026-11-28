import {
  applyNotebookUpdate,
  notebookContentSchema,
  sortLessons,
  type Lesson,
  type NotebookProject,
} from '@trama/core';
import { vi } from 'vitest';
import { ApiError } from '../api/http';
import type { LessonsApi } from '../api/lessons-api';
import type { NotebooksApi } from '../api/notebooks-api';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Um caderno de teste (conteúdo com os padrões, a não ser que `content` diga outra coisa). */
export function notebook(
  n: number,
  title: string,
  content: Partial<NotebookProject['content']> = {},
): NotebookProject {
  return {
    id: uuid(100 + n),
    kind: 'notebook',
    title,
    status: 'draft',
    driveFileId: null,
    revision: 1,
    createdAt: `2026-11-0${n}T10:00:00.000Z`,
    updatedAt: `2026-11-0${n}T10:00:00.000Z`,
    content: notebookContentSchema.parse(content),
  };
}

/** Uma aula de teste. */
export function lesson(n: number, notebookId: string, extra: Partial<Lesson> = {}): Lesson {
  return {
    id: uuid(n),
    notebookId,
    title: `Aula ${n}`,
    notes: '',
    status: 'studying',
    studiedAt: null,
    reviewedAt: null,
    reviewOn: null,
    position: n,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    ...extra,
  };
}

/** As APIs de cadernos e aulas em memória, para os testes das telas de Estudos. */
export function createFakeStudies(initial: { notebooks?: NotebookProject[]; lessons?: Lesson[] }) {
  const notebooks = new Map((initial.notebooks ?? []).map((item) => [item.id, item]));
  const lessons = new Map((initial.lessons ?? []).map((item) => [item.id, item]));
  let next = 1000;
  const failures = new Map<string, string>();

  /** A próxima chamada deste método (`notebooks.create`, `lessons.update`...) falha. */
  const failNext = (method: string, message: string) => failures.set(method, message);
  const check = (method: string) => {
    const message = failures.get(method);
    if (message === undefined) return;
    failures.delete(method);
    throw new ApiError(message, 500);
  };

  const notebooksApi = {
    list: vi.fn(() =>
      Promise.resolve().then(() => {
        check('notebooks.list');
        return [...notebooks.values()];
      }),
    ),
    get: vi.fn((id: string) =>
      Promise.resolve().then(() => {
        const found = notebooks.get(id);
        if (!found) throw new ApiError('Caderno não encontrado.', 404);
        return found;
      }),
    ),
    create: vi.fn((input: Parameters<NotebooksApi['create']>[0]) =>
      Promise.resolve().then(() => {
        check('notebooks.create');
        next += 1;
        const created = notebook(1, input.title ?? 'Sem título', input.content);
        const withId = { ...created, id: uuid(next) };
        notebooks.set(withId.id, withId);
        return withId;
      }),
    ),
    update: vi.fn((id: string, patch: Parameters<NotebooksApi['update']>[1]) =>
      Promise.resolve().then(() => {
        check('notebooks.update');
        const found = notebooks.get(id);
        if (!found) throw new ApiError('Caderno não encontrado.', 404);
        const { title, ...contentPatch } = patch;
        const updated = {
          ...found,
          title: title ?? found.title,
          content: applyNotebookUpdate(found.content, contentPatch),
        };
        notebooks.set(id, updated);
        return updated;
      }),
    ),
    remove: vi.fn((id: string) =>
      Promise.resolve().then(() => {
        check('notebooks.remove');
        notebooks.delete(id);
        for (const item of lessons.values()) if (item.notebookId === id) lessons.delete(item.id);
      }),
    ),
  } satisfies NotebooksApi;

  const lessonsApi = {
    listAll: vi.fn(() =>
      Promise.resolve().then(() => {
        check('lessons.listAll');
        return [...lessons.values()];
      }),
    ),
    list: vi.fn((notebookId: string) =>
      Promise.resolve(
        sortLessons([...lessons.values()].filter((l) => l.notebookId === notebookId)),
      ),
    ),
    create: vi.fn((notebookId: string, input: Parameters<LessonsApi['create']>[1]) =>
      Promise.resolve().then(() => {
        check('lessons.create');
        next += 1;
        const created = lesson(next, notebookId, {
          title: input.title,
          position: [...lessons.values()].filter((l) => l.notebookId === notebookId).length,
        });
        lessons.set(created.id, created);
        return created;
      }),
    ),
    update: vi.fn((_notebookId: string, id: string, patch: Parameters<LessonsApi['update']>[2]) =>
      Promise.resolve().then(() => {
        check('lessons.update');
        const found = lessons.get(id);
        if (!found) throw new ApiError('Aula não encontrada.', 404);
        const changes = Object.fromEntries(
          Object.entries(patch).filter(([, value]) => value !== undefined),
        );
        const updated: Lesson = { ...found, ...changes };
        lessons.set(id, updated);
        return updated;
      }),
    ),
    remove: vi.fn((_notebookId: string, id: string) =>
      Promise.resolve().then(() => {
        check('lessons.remove');
        lessons.delete(id);
      }),
    ),
  } satisfies LessonsApi;

  return { notebooksApi, lessonsApi, notebooks, lessons, failNext };
}

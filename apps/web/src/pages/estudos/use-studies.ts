import { sortLessons, type Lesson, type NotebookProject } from '@trama/core';
import { useCallback, useEffect, useState } from 'react';
import type { LessonsApi } from '../../api/lessons-api';
import type { NotebooksApi } from '../../api/notebooks-api';

type Loaded =
  | { status: 'ready'; notebooks: NotebookProject[]; lessons: Lesson[] }
  | { status: 'failed'; message: string };

export type StudiesData =
  | { status: 'loading' }
  | { status: 'ready'; notebooks: NotebookProject[]; lessons: Lesson[] }
  | { status: 'failed'; message: string };

const byCreation = (a: NotebookProject, b: NotebookProject) =>
  a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

/**
 * Os cadernos e todas as aulas da pessoa (duas consultas, que alimentam os cartões, as tabelas
 * e a barra lateral). As telas mudam a lista já carregada depois de cada gravação, sem pedir
 * tudo outra vez.
 */
export function useStudies(notebooks: NotebooksApi, lessons: LessonsApi) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    Promise.all([notebooks.list(), lessons.listAll()]).then(
      ([books, all]) =>
        alive &&
        setLoaded({
          status: 'ready',
          notebooks: [...books].sort(byCreation),
          lessons: all,
        }),
      (error: unknown) =>
        alive &&
        setLoaded({
          status: 'failed',
          message: error instanceof Error ? error.message : 'Não deu para carregar os Estudos.',
        }),
    );
    return () => {
      alive = false;
    };
  }, [notebooks, lessons, attempt]);

  const retry = useCallback(() => {
    setLoaded(null);
    setAttempt((value) => value + 1);
  }, []);

  const change = useCallback((edit: (current: Extract<Loaded, { status: 'ready' }>) => Loaded) => {
    setLoaded((current) => (current?.status === 'ready' ? edit(current) : current));
  }, []);

  const putNotebook = useCallback(
    (notebook: NotebookProject) =>
      change((current) => ({
        ...current,
        notebooks: [...current.notebooks.filter((n) => n.id !== notebook.id), notebook].sort(
          byCreation,
        ),
      })),
    [change],
  );

  const dropNotebook = useCallback(
    (id: string) =>
      change((current) => ({
        ...current,
        notebooks: current.notebooks.filter((n) => n.id !== id),
        lessons: current.lessons.filter((lesson) => lesson.notebookId !== id),
      })),
    [change],
  );

  /** Põe aulas novas ou mudadas (pelo id) e mantém cada caderno na ordem dele. */
  const putLessons = useCallback(
    (changed: Lesson[]) =>
      change((current) => {
        const ids = new Set(changed.map((lesson) => lesson.id));
        const rest = current.lessons.filter((lesson) => !ids.has(lesson.id));
        return { ...current, lessons: [...rest, ...changed] };
      }),
    [change],
  );

  const dropLesson = useCallback(
    (id: string) =>
      change((current) => ({
        ...current,
        lessons: current.lessons.filter((lesson) => lesson.id !== id),
      })),
    [change],
  );

  const data: StudiesData = loaded ?? { status: 'loading' };
  return { data, retry, putNotebook, dropNotebook, putLessons, dropLesson };
}

/** As aulas de um caderno, na ordem dele. */
export function lessonsOf(lessons: readonly Lesson[], notebookId: string): Lesson[] {
  return sortLessons(lessons.filter((lesson) => lesson.notebookId === notebookId));
}

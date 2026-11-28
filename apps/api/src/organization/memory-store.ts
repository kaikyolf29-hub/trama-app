import { sortLessons, type AgendaEvent, type Lesson, type ProjectKind } from '@trama/core';
import type { OrganizationStore } from './store';

/**
 * Eventos e aulas em memória, com as regras do banco que as rotas veem (caderno só aceita aula,
 * só anotação se apaga). Os gatilhos do banco ficam de fora: para testar eventos automáticos,
 * `events` aceita linhas postas direto. Só para testes.
 */
export function createMemoryOrganizationStore(
  clock: () => Date = () => new Date(),
): OrganizationStore & {
  events: Map<string, AgendaEvent>;
  lessonRows: Map<string, Lesson>;
  /** Projetos que existem para a pessoa (id e tipo): é o que decide se há caderno ou projeto. */
  projects: Map<string, ProjectKind>;
} {
  const events = new Map<string, AgendaEvent>();
  const lessonRows = new Map<string, Lesson>();
  const projects = new Map<string, ProjectKind>();
  const now = () => clock().toISOString();
  const isNotebook = (id: string) => projects.get(id) === 'notebook';

  return {
    events,
    lessonRows,
    projects,

    list: ({ from, to }) =>
      Promise.resolve(
        [...events.values()]
          .filter((event) => event.occurredAt >= from && event.occurredAt < to)
          .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id)),
      ),

    createNote: ({ title, detail, occurredAt, projectId }) => {
      if (projectId !== undefined && !projects.has(projectId)) return Promise.resolve(null);
      const event: AgendaEvent = {
        id: crypto.randomUUID(),
        type: 'note',
        occurredAt,
        projectId: projectId ?? null,
        projectKind: projectId === undefined ? null : (projects.get(projectId) ?? null),
        lessonId: null,
        title,
        detail: detail && detail !== '' ? detail : null,
        source: 'manual',
        createdAt: now(),
      };
      events.set(event.id, event);
      return Promise.resolve(event);
    },

    remove: (id) => {
      const event = events.get(id);
      if (!event) return Promise.resolve('not_found');
      if (event.source !== 'manual') return Promise.resolve('not_manual');
      events.delete(id);
      return Promise.resolve('removed');
    },

    lessons: {
      listAll: () =>
        Promise.resolve(
          [...new Set([...lessonRows.values()].map((l) => l.notebookId))]
            .sort()
            .flatMap((id) =>
              sortLessons([...lessonRows.values()].filter((l) => l.notebookId === id)),
            ),
        ),

      list: (notebookId) =>
        Promise.resolve(
          isNotebook(notebookId)
            ? sortLessons([...lessonRows.values()].filter((l) => l.notebookId === notebookId))
            : null,
        ),

      create: (notebookId, input) => {
        if (!isNotebook(notebookId)) return Promise.resolve(null);
        const siblings = [...lessonRows.values()].filter((l) => l.notebookId === notebookId);
        const at = now();
        const lesson: Lesson = {
          id: crypto.randomUUID(),
          notebookId,
          title: input.title,
          notes: input.notes ?? '',
          status: input.status ?? 'studying',
          studiedAt: input.studiedAt ?? null,
          reviewedAt: input.reviewedAt ?? null,
          reviewOn: input.reviewOn ?? null,
          position: input.position ?? Math.max(-1, ...siblings.map((l) => l.position)) + 1,
          createdAt: at,
          updatedAt: at,
        };
        lessonRows.set(lesson.id, lesson);
        return Promise.resolve(lesson);
      },

      update: (notebookId, lessonId, patch) => {
        const lesson = lessonRows.get(lessonId);
        if (!lesson || lesson.notebookId !== notebookId) return Promise.resolve(null);
        const updated: Lesson = {
          ...lesson,
          ...(patch.title === undefined ? {} : { title: patch.title }),
          ...(patch.notes === undefined ? {} : { notes: patch.notes }),
          ...(patch.status === undefined ? {} : { status: patch.status }),
          ...(patch.studiedAt === undefined ? {} : { studiedAt: patch.studiedAt }),
          ...(patch.reviewedAt === undefined ? {} : { reviewedAt: patch.reviewedAt }),
          ...(patch.reviewOn === undefined ? {} : { reviewOn: patch.reviewOn }),
          ...(patch.position === undefined ? {} : { position: patch.position }),
          updatedAt: now(),
        };
        lessonRows.set(lessonId, updated);
        return Promise.resolve(updated);
      },

      remove: (notebookId, lessonId) => {
        const lesson = lessonRows.get(lessonId);
        if (!lesson || lesson.notebookId !== notebookId) return Promise.resolve(false);
        lessonRows.delete(lessonId);
        return Promise.resolve(true);
      },
    },
  };
}

import {
  createAnyProjectRequestSchema,
  createEmptyFlow,
  createEmptyNotebook,
  createEmptyScript,
  createLessonRequestSchema,
  createNoteRequestSchema,
  eventSchema,
  flowContentSchema,
  lessonSchema,
  type AgendaEvent,
  type AiOrganizeResponse,
  type Lesson,
  type ProjectStatus,
} from '@trama/core';
import { TramaApiError, type ApiProject, type TramaApi } from '../trama-api';

/**
 * A API do Trama em memória, com as regras que importam para as ferramentas: valida o que entra
 * com os esquemas do core (como a API de verdade), sobe a revisão, guarda os eventos que os
 * gatilhos do banco gravariam (criado, concluído, aula estudada) e as anotações.
 */
export function createFakeTrama(
  options: {
    now?: () => Date;
    timeZone?: string | null;
    organize?: AiOrganizeResponse;
  } = {},
) {
  const now = options.now ?? (() => new Date());
  const projects = new Map<string, ApiProject>();
  const events: AgendaEvent[] = [];
  const lessons: Lesson[] = [];
  /** O que foi escrito, na ordem: ajuda a conferir que leitura não escreve. */
  const writes: string[] = [];
  const tokens = new Set<string>();
  let failNotes = false;

  const notFound = () => new TramaApiError(404, 'Projeto não encontrado.');
  const summary = (project: ApiProject) => ({
    id: project.id,
    kind: project.kind,
    title: project.title,
    status: project.status,
    revision: project.revision,
    updatedAt: project.updatedAt,
  });
  const addEvent = (
    event: Pick<AgendaEvent, 'type' | 'title'> & Partial<AgendaEvent>,
    source: 'auto' | 'manual',
  ) => {
    const at = event.occurredAt ?? now().toISOString();
    const stored = eventSchema.parse({
      id: crypto.randomUUID(),
      occurredAt: at,
      projectId: null,
      projectKind: null,
      lessonId: null,
      detail: null,
      createdAt: now().toISOString(),
      source,
      ...event,
    });
    events.push(stored);
    return stored;
  };

  function api(token = 'token'): TramaApi {
    tokens.add(token);
    return {
      timeZone: () =>
        Promise.resolve(options.timeZone === undefined ? 'America/Sao_Paulo' : options.timeZone),
      listProjects: () =>
        Promise.resolve(
          [...projects.values()]
            .map(summary)
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        ),
      getProject(id) {
        const project = projects.get(id);
        return project ? Promise.resolve(structuredClone(project)) : Promise.reject(notFound());
      },
      createProject(request) {
        const parsed = createAnyProjectRequestSchema.safeParse(request);
        if (!parsed.success) {
          return Promise.reject(new TramaApiError(400, 'Dados do projeto inválidos.'));
        }
        const data = parsed.data;
        const content =
          data.kind === 'flow'
            ? (data.content ?? createEmptyFlow())
            : data.kind === 'script'
              ? (data.content ?? createEmptyScript())
              : (data.content ?? createEmptyNotebook());
        const at = now().toISOString();
        const project: ApiProject = {
          id: crypto.randomUUID(),
          kind: data.kind,
          title: data.title,
          status: 'draft',
          revision: 1,
          updatedAt: at,
          content,
        };
        projects.set(project.id, project);
        writes.push(`create:${project.kind}`);
        addEvent(
          {
            type: 'created',
            title: project.title,
            projectId: project.id,
            projectKind: project.kind,
          },
          'auto',
        );
        return Promise.resolve(structuredClone(project));
      },
      saveFlow(id, content, baseRevision) {
        const project = projects.get(id);
        if (!project) return Promise.reject(notFound());
        if (!flowContentSchema.safeParse(content).success) {
          return Promise.reject(new TramaApiError(400, 'O fluxo enviado não é válido.'));
        }
        const overwrote = project.revision !== baseRevision;
        project.content = structuredClone(content);
        project.revision += 1;
        project.updatedAt = now().toISOString();
        writes.push(`save:${id}`);
        return Promise.resolve({
          revision: project.revision,
          updatedAt: project.updatedAt,
          overwrote,
        });
      },
      setStatus(id, status: ProjectStatus) {
        const project = projects.get(id);
        if (!project) return Promise.reject(notFound());
        const was = project.status;
        project.status = status;
        project.updatedAt = now().toISOString();
        writes.push(`status:${status}`);
        if (status === 'done' && was !== 'done') {
          addEvent(
            { type: 'completed', title: project.title, projectId: id, projectKind: project.kind },
            'auto',
          );
        }
        return Promise.resolve(summary(project));
      },
      listEvents: ({ from, to }) =>
        Promise.resolve(
          events.filter(
            (event) =>
              new Date(event.occurredAt).getTime() >= new Date(from).getTime() &&
              new Date(event.occurredAt).getTime() < new Date(to).getTime(),
          ),
        ),
      addNote(note) {
        if (failNotes) return Promise.reject(new TramaApiError(500, 'falhou'));
        const parsed = createNoteRequestSchema.safeParse(note);
        if (!parsed.success)
          return Promise.reject(new TramaApiError(400, 'Dados da anotação inválidos.'));
        const project = parsed.data.projectId ? projects.get(parsed.data.projectId) : null;
        if (parsed.data.projectId && !project) return Promise.reject(notFound());
        writes.push('note');
        return Promise.resolve(
          addEvent(
            {
              type: 'note',
              title: parsed.data.title,
              detail: parsed.data.detail ?? null,
              projectId: project?.id ?? null,
              projectKind: project?.kind ?? null,
              ...(parsed.data.occurredAt ? { occurredAt: parsed.data.occurredAt } : {}),
            },
            'manual',
          ),
        );
      },
      createLesson(notebookId, request) {
        const notebook = projects.get(notebookId);
        if (!notebook || notebook.kind !== 'notebook') {
          return Promise.reject(new TramaApiError(404, 'Caderno não encontrado.'));
        }
        const parsed = createLessonRequestSchema.safeParse(request);
        if (!parsed.success)
          return Promise.reject(new TramaApiError(400, 'Dados da aula inválidos.'));
        const at = now().toISOString();
        const lesson = lessonSchema.parse({
          id: crypto.randomUUID(),
          notebookId,
          title: parsed.data.title,
          notes: parsed.data.notes,
          status: parsed.data.status,
          studiedAt: parsed.data.studiedAt,
          reviewedAt: parsed.data.reviewedAt,
          reviewOn: parsed.data.reviewOn,
          position: lessons.filter((item) => item.notebookId === notebookId).length,
          createdAt: at,
          updatedAt: at,
        });
        lessons.push(lesson);
        writes.push('lesson');
        if (lesson.studiedAt) {
          addEvent(
            {
              type: 'studied',
              title: lesson.title,
              detail: notebook.title,
              occurredAt: lesson.studiedAt,
              projectId: notebookId,
              projectKind: 'notebook',
              lessonId: lesson.id,
            },
            'auto',
          );
        }
        return Promise.resolve(lesson);
      },
      organize(request) {
        writes.push('organize');
        if (!options.organize) {
          return Promise.reject(
            new TramaApiError(409, 'Escolha a IA em Configurações antes.', 'no_settings'),
          );
        }
        void request;
        return Promise.resolve(options.organize);
      },
    };
  }

  return {
    api,
    projects,
    events,
    lessons,
    writes,
    tokens,
    /** A gravação da anotação da Agenda falha (a escrita principal já foi feita). */
    failNotes(value: boolean) {
      failNotes = value;
    },
    /** Põe um projeto pronto, sem passar pelas regras de criação. */
    seed(project: Omit<ApiProject, 'updatedAt'> & { updatedAt?: string }) {
      projects.set(project.id, { updatedAt: now().toISOString(), ...project });
    },
  };
}

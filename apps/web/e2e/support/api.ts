import {
  applyNotebookUpdate,
  applyProfileUpdate,
  createEmptyFlow,
  createLessonRequestSchema,
  createNoteRequestSchema,
  createNotebookRequestSchema,
  createProjectRequestSchema,
  DEFAULT_EMAIL_PREFERENCES,
  DEFAULT_TIME_ZONE,
  notebookContentSchema,
  saveProjectRequestSchema,
  sortLessons,
  updateLessonRequestSchema,
  updateNotebookRequestSchema,
  updateProfileRequestSchema,
  updateProjectRequestSchema,
  type AgendaEvent,
  type FlowContent,
  type FlowProject,
  type Lesson,
  type NotebookProject,
  type Profile,
  type ProjectSummary,
  type SaveProjectRequest,
} from '@trama/core';
import type { Page, Route } from '@playwright/test';

/** Endereço da API que o site usa no `vite build` (VITE_API_URL do apps/web/.env). */
export const API_URL = 'http://localhost:8787';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
};

/** Um pedido que o site fez à API, para os testes conferirem. */
export interface ApiCall {
  method: string;
  /** Caminho sem o endereço, ex.: `/projects/abc`. */
  path: string;
  body: unknown;
  authorization: string | undefined;
}

/** O que `FakeApi.seed` aceita: tudo o que faltar recebe um valor padrão. */
export type ProjectSeed = Partial<Omit<FlowProject, 'content'>> & { content?: FlowContent };

/**
 * A API de projetos (apps/api) em memória, ligada a uma página por `page.route`: criar,
 * listar, abrir, salvar (PUT com revisão), renomear/mudar status (PATCH) e apagar. Valida os
 * corpos com os esquemas do `@trama/core`, como a API de verdade, e anota cada pedido.
 */
export class FakeApi {
  readonly projects = new Map<string, FlowProject>();
  /** Eventos da Agenda (GET, POST e DELETE de `/events`). */
  readonly events = new Map<string, AgendaEvent>();
  /** Cadernos de Estudos (`/notebooks`) e as aulas deles (`/notebooks/:id/lessons`, `/lessons`). */
  readonly notebooks = new Map<string, NotebookProject>();
  readonly lessons = new Map<string, Lesson>();
  /** O perfil (`/account/profile`): fuso e preferências de e-mail. */
  profile: Profile = {
    name: 'Ana Souza',
    timezone: DEFAULT_TIME_ZONE,
    emailPreferences: { ...DEFAULT_EMAIL_PREFERENCES },
  };
  readonly calls: ApiCall[] = [];
  /** Cada PUT aceito, com o projeto e o pedido, na ordem. */
  readonly saves: { id: string; request: SaveProjectRequest }[] = [];
  private tick = 0;
  private failures = new Map<string, number>();

  /** Atraso (ms) antes de responder, para testar estados de "carregando". */
  delay = 0;

  /** Cria um projeto já existente na "conta" (como se tivesse sido salvo antes). */
  seed(input: ProjectSeed = {}): FlowProject {
    const at = this.now();
    const project: FlowProject = {
      id: crypto.randomUUID(),
      kind: 'flow',
      title: 'Projeto de teste',
      status: 'draft',
      driveFileId: null,
      revision: 1,
      createdAt: at,
      updatedAt: at,
      content: createEmptyFlow(),
      ...input,
    };
    this.projects.set(project.id, project);
    return project;
  }

  /** Põe um evento na Agenda da "conta". Sem projeto, é uma anotação feita à mão. */
  seedEvent(
    input: Pick<AgendaEvent, 'type' | 'occurredAt' | 'title'> & Partial<AgendaEvent>,
  ): AgendaEvent {
    const event: AgendaEvent = {
      id: crypto.randomUUID(),
      projectId: null,
      projectKind: null,
      lessonId: null,
      detail: null,
      source: input.type === 'note' ? 'manual' : 'auto',
      createdAt: input.occurredAt,
      ...input,
    };
    this.events.set(event.id, event);
    return event;
  }

  /** Cria um caderno de Estudos já existente na "conta". */
  seedNotebook(
    input: Partial<Omit<NotebookProject, 'content'>> & {
      content?: Partial<NotebookProject['content']>;
    } = {},
  ): NotebookProject {
    const at = this.now();
    const { content, ...rest } = input;
    const notebook: NotebookProject = {
      id: crypto.randomUUID(),
      kind: 'notebook',
      title: 'Caderno de teste',
      status: 'draft',
      driveFileId: null,
      revision: 1,
      createdAt: at,
      updatedAt: at,
      ...rest,
      content: notebookContentSchema.parse(content ?? {}),
    };
    this.notebooks.set(notebook.id, notebook);
    return notebook;
  }

  /** Põe uma aula num caderno. */
  seedLesson(notebookId: string, input: Partial<Lesson> = {}): Lesson {
    const at = this.now();
    const siblings = [...this.lessons.values()].filter((l) => l.notebookId === notebookId);
    const lesson: Lesson = {
      id: crypto.randomUUID(),
      notebookId,
      title: 'Aula de teste',
      notes: '',
      status: 'studying',
      studiedAt: null,
      reviewedAt: null,
      reviewOn: null,
      position: siblings.length,
      createdAt: at,
      updatedAt: at,
      ...input,
    };
    this.lessons.set(lesson.id, lesson);
    return lesson;
  }

  /** O PUT mais recente aceito para o projeto. */
  lastSave(id: string): SaveProjectRequest | undefined {
    return this.saves.filter((save) => save.id === id).at(-1)?.request;
  }

  /** Chamadas já feitas com o método e o caminho (aceita prefixo com `*` no fim). */
  callsTo(method: string, path: string): ApiCall[] {
    const prefix = path.endsWith('*') ? path.slice(0, -1) : undefined;
    return this.calls.filter(
      (call) =>
        call.method === method &&
        (prefix === undefined ? call.path === path : call.path.startsWith(prefix)),
    );
  }

  /** A próxima chamada `MÉTODO caminho` (ex.: `PUT /projects/x`) responde com este erro. */
  failNext(operation: string, status = 500, message = 'Falha simulada.') {
    this.failures.set(`${operation}|${status}|${message}`, 1);
  }

  /** Liga a API a uma página. */
  async attach(page: Page) {
    await page.route(`${API_URL}/**`, (route) => this.handle(route));
  }

  private now() {
    // Sempre crescente, para a lista "mais recente primeiro" ser previsível.
    return new Date(Date.now() + this.tick++ * 1000).toISOString();
  }

  private summary(project: FlowProject): ProjectSummary {
    const { id, kind, title, status, revision, updatedAt } = project;
    return { id, kind, title, status, revision, updatedAt };
  }

  private json(route: Route, status: number, body?: unknown) {
    return route.fulfill({
      status,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  private error(route: Route, status: number, message: string) {
    return this.json(route, status, { error: message });
  }

  private handleEvents(route: Route, method: string, url: URL, path: string, body: unknown) {
    if (path === '/events' && method === 'GET') {
      const from = url.searchParams.get('from') ?? '';
      const to = url.searchParams.get('to') ?? '';
      const list = [...this.events.values()]
        .filter((event) => event.occurredAt >= from && event.occurredAt < to)
        .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
      return this.json(route, 200, list);
    }
    if (path === '/events' && method === 'POST') {
      const parsed = createNoteRequestSchema.safeParse(body);
      if (!parsed.success) return this.error(route, 400, 'Dados da anotação inválidos.');
      const at = new Date(parsed.data.occurredAt ?? Date.now()).toISOString();
      const event = this.seedEvent({
        type: 'note',
        occurredAt: at,
        title: parsed.data.title,
        detail: parsed.data.detail ?? null,
      });
      return this.json(route, 201, event);
    }
    const id = /^\/events\/([^/]+)$/.exec(path)?.[1];
    if (id !== undefined && method === 'DELETE') {
      const event = this.events.get(id);
      if (!event) return this.error(route, 404, 'Evento não encontrado.');
      if (event.source !== 'manual') {
        return this.error(route, 403, 'Só anotações feitas à mão podem ser apagadas.');
      }
      this.events.delete(id);
      return route.fulfill({ status: 204, headers: CORS });
    }
    return this.error(route, 404, 'Rota não encontrada.');
  }

  /** O que o banco faz sozinho: aula estudada ou revisada vira evento da Agenda. */
  private logLesson(before: Lesson | undefined, lesson: Lesson) {
    const notebook = this.notebooks.get(lesson.notebookId);
    for (const [type, at, previous] of [
      ['studied', lesson.studiedAt, before?.studiedAt],
      ['reviewed', lesson.reviewedAt, before?.reviewedAt],
    ] as const) {
      if (at && at !== previous) {
        this.seedEvent({
          type,
          occurredAt: at,
          title: lesson.title,
          detail: notebook?.title ?? null,
          projectId: lesson.notebookId,
          projectKind: 'notebook',
          lessonId: lesson.id,
        });
      }
    }
  }

  private handleLessons(
    route: Route,
    method: string,
    notebookId: string,
    lessonId: string | undefined,
    body: unknown,
  ) {
    if (!this.notebooks.has(notebookId)) return this.error(route, 404, 'Caderno não encontrado.');
    if (lessonId === undefined) {
      if (method === 'GET') {
        const own = [...this.lessons.values()].filter((l) => l.notebookId === notebookId);
        return this.json(route, 200, sortLessons(own));
      }
      if (method === 'POST') {
        const parsed = createLessonRequestSchema.safeParse(body);
        if (!parsed.success) return this.error(route, 400, 'Dados da aula inválidos.');
        const { studiedAt, reviewedAt, reviewOn, ...rest } = parsed.data;
        const lesson = this.seedLesson(notebookId, {
          ...rest,
          ...(studiedAt === undefined ? {} : { studiedAt }),
          ...(reviewedAt === undefined ? {} : { reviewedAt }),
          ...(reviewOn === undefined ? {} : { reviewOn }),
        });
        this.logLesson(undefined, lesson);
        return this.json(route, 201, lesson);
      }
      return this.error(route, 405, 'Método não permitido.');
    }
    const lesson = this.lessons.get(lessonId);
    if (!lesson || lesson.notebookId !== notebookId) {
      return this.error(route, 404, 'Aula não encontrada.');
    }
    if (method === 'DELETE') {
      this.lessons.delete(lessonId);
      return route.fulfill({ status: 204, headers: CORS });
    }
    if (method === 'PATCH') {
      const parsed = updateLessonRequestSchema.safeParse(body);
      if (!parsed.success) return this.error(route, 400, 'Dados da aula inválidos.');
      const changes = Object.fromEntries(
        Object.entries(parsed.data).filter(([, value]) => value !== undefined),
      );
      const updated: Lesson = { ...lesson, ...changes, updatedAt: this.now() };
      this.lessons.set(lessonId, updated);
      this.logLesson(lesson, updated);
      return this.json(route, 200, updated);
    }
    return this.error(route, 405, 'Método não permitido.');
  }

  private handleNotebooks(route: Route, method: string, path: string, body: unknown) {
    const match = /^\/notebooks(?:\/([^/]+)(?:\/lessons(?:\/([^/]+))?)?)?$/.exec(path);
    if (!match) return this.error(route, 404, 'Rota não encontrada.');
    const [, id, lessonId] = match;
    if (id === undefined) {
      if (method === 'GET') return this.json(route, 200, [...this.notebooks.values()]);
      if (method === 'POST') {
        const parsed = createNotebookRequestSchema.safeParse(body);
        if (!parsed.success) return this.error(route, 400, 'Dados do caderno inválidos.');
        const notebook = this.seedNotebook({
          title: parsed.data.title,
          content: parsed.data.content ?? {},
        });
        this.seedEvent({
          type: 'created',
          occurredAt: notebook.createdAt,
          title: notebook.title,
          projectId: notebook.id,
          projectKind: 'notebook',
        });
        return this.json(route, 201, notebook);
      }
      return this.error(route, 405, 'Método não permitido.');
    }
    if (path.includes('/lessons')) return this.handleLessons(route, method, id, lessonId, body);
    const notebook = this.notebooks.get(id);
    if (!notebook) return this.error(route, 404, 'Caderno não encontrado.');
    if (method === 'GET') return this.json(route, 200, notebook);
    if (method === 'PATCH') {
      const parsed = updateNotebookRequestSchema.safeParse(body);
      if (!parsed.success) return this.error(route, 400, 'Pedido inválido.');
      const { title, ...patch } = parsed.data;
      const contentChanges = Object.values(patch).some((value) => value !== undefined);
      const updated: NotebookProject = {
        ...notebook,
        title: title ?? notebook.title,
        content: applyNotebookUpdate(notebook.content, patch),
        revision: contentChanges ? notebook.revision + 1 : notebook.revision,
        updatedAt: this.now(),
      };
      this.notebooks.set(id, updated);
      return this.json(route, 200, updated);
    }
    return this.error(route, 405, 'Método não permitido.');
  }

  private handleAccount(route: Route, method: string, body: unknown) {
    if (method === 'GET') return this.json(route, 200, this.profile);
    if (method === 'PATCH') {
      const parsed = updateProfileRequestSchema.safeParse(body);
      if (!parsed.success) return this.error(route, 400, 'Pedido inválido.');
      this.profile = applyProfileUpdate(this.profile, parsed.data);
      return this.json(route, 200, this.profile);
    }
    return this.error(route, 405, 'Método não permitido.');
  }

  private async handle(route: Route) {
    const request = route.request();
    const method = request.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });

    const url = new URL(request.url());
    const path = url.pathname;
    const raw = request.postData();
    const body: unknown = raw ? JSON.parse(raw) : undefined;
    this.calls.push({
      method,
      path,
      body,
      authorization: request.headers()['authorization'],
    });
    if (this.delay > 0) await new Promise((resolve) => setTimeout(resolve, this.delay));

    for (const [key] of this.failures) {
      const [operation = '', status = '500', message = ''] = key.split('|');
      if (operation === `${method} ${path}`) {
        this.failures.delete(key);
        return this.error(route, Number(status), message);
      }
    }

    if (!request.headers()['authorization']?.startsWith('Bearer ')) {
      return this.error(route, 401, 'Entre na sua conta para continuar.');
    }

    if (path === '/events' || path.startsWith('/events/')) {
      return this.handleEvents(route, method, url, path, body);
    }

    if (path === '/notebooks' || path.startsWith('/notebooks/')) {
      return this.handleNotebooks(route, method, path, body);
    }
    if (path === '/lessons' && method === 'GET') {
      return this.json(route, 200, [...this.lessons.values()]);
    }
    if (path === '/account/profile') return this.handleAccount(route, method, body);

    const match = /^\/projects(?:\/([^/]+))?$/.exec(path);
    if (!match) return this.error(route, 404, 'Rota não encontrada.');
    const id = match[1];
    // Apagar um caderno é apagar o projeto (e as aulas vão junto).
    if (id !== undefined && this.notebooks.has(id) && method === 'DELETE') {
      this.notebooks.delete(id);
      for (const lesson of this.lessons.values()) {
        if (lesson.notebookId === id) this.lessons.delete(lesson.id);
      }
      return route.fulfill({ status: 204, headers: CORS });
    }

    if (id === undefined) {
      if (method === 'GET') {
        const list = [...this.projects.values()]
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .map((project) => this.summary(project));
        return this.json(route, 200, list);
      }
      if (method === 'POST') {
        const parsed = createProjectRequestSchema.safeParse(body);
        if (!parsed.success) return this.error(route, 400, 'Pedido inválido.');
        const project = this.seed({
          title: parsed.data.title,
          content: parsed.data.content ?? createEmptyFlow(),
        });
        return this.json(route, 201, project);
      }
      return this.error(route, 405, 'Método não permitido.');
    }

    const project = this.projects.get(id);
    if (!project) return this.error(route, 404, 'Projeto não encontrado.');

    if (method === 'GET') return this.json(route, 200, project);

    if (method === 'DELETE') {
      this.projects.delete(id);
      return route.fulfill({ status: 204, headers: CORS });
    }

    if (method === 'PATCH') {
      const parsed = updateProjectRequestSchema.safeParse(body);
      if (!parsed.success) return this.error(route, 400, 'Pedido inválido.');
      // Como a API: muda o título e o status, sobe `updatedAt`, mas não a revisão.
      const updated = { ...project, ...parsed.data, updatedAt: this.now() };
      this.projects.set(id, updated);
      return this.json(route, 200, this.summary(updated));
    }

    if (method === 'PUT') {
      const parsed = saveProjectRequestSchema.safeParse(body);
      if (!parsed.success) return this.error(route, 400, 'Pedido inválido.');
      this.saves.push({ id, request: parsed.data });
      const saved: FlowProject = {
        ...project,
        content: parsed.data.content,
        title: parsed.data.title ?? project.title,
        revision: project.revision + 1,
        updatedAt: this.now(),
      };
      this.projects.set(id, saved);
      return this.json(route, 200, {
        revision: saved.revision,
        updatedAt: saved.updatedAt,
        overwrote: parsed.data.baseRevision !== project.revision,
      });
    }

    return this.error(route, 405, 'Método não permitido.');
  }
}

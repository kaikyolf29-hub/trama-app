import {
  createEmptyFlow,
  createProjectRequestSchema,
  saveProjectRequestSchema,
  updateProjectRequestSchema,
  type FlowContent,
  type FlowProject,
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

    const match = /^\/projects(?:\/([^/]+))?$/.exec(path);
    if (!match) return this.error(route, 404, 'Rota não encontrada.');
    const id = match[1];

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

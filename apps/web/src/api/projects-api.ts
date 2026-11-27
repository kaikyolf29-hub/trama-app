import {
  apiErrorSchema,
  flowProjectSchema,
  projectSummarySchema,
  saveProjectResponseSchema,
  type CreateProjectRequest,
  type FlowProject,
  type ProjectSummary,
  type SaveProjectRequest,
  type SaveProjectResponse,
  type UpdateProjectRequest,
} from '@trama/core';
import { z } from 'zod';

/** Erro da API já em português, pronto para a tela. `status` 0 quer dizer sem conexão. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** O que as telas usam da API de projetos (apps/api). */
export interface ProjectsApi {
  list(): Promise<ProjectSummary[]>;
  create(input: CreateProjectRequest): Promise<FlowProject>;
  get(id: string): Promise<FlowProject>;
  /** Renomeia e/ou muda o status, sem mexer no conteúdo. */
  update(id: string, patch: UpdateProjectRequest): Promise<ProjectSummary>;
  remove(id: string): Promise<void>;
  save(
    id: string,
    request: SaveProjectRequest,
    options?: { keepalive?: boolean },
  ): Promise<SaveProjectResponse>;
}

const OFFLINE = 'Sem conexão com o Trama. Suas mudanças ficam aqui e salvam quando voltar.';
const SIGNED_OUT = 'Entre na sua conta para continuar.';

/**
 * Cliente da API de projetos. Toda resposta passa pelos esquemas do `@trama/core`: se a API
 * mandar algo fora do contrato, a tela não recebe dado quebrado.
 */
export function createProjectsApi({
  baseUrl,
  getToken,
  fetch: fetcher = (...args) => fetch(...args),
}: {
  baseUrl: string;
  getToken: () => Promise<string | null>;
  fetch?: typeof fetch;
}): ProjectsApi {
  const root = baseUrl.replace(/\/$/, '');

  async function call<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
    const token = await getToken();
    if (!token) throw new ApiError(SIGNED_OUT, 401);
    let response: Response;
    try {
      response = await fetcher(`${root}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
      });
    } catch {
      throw new ApiError(OFFLINE, 0);
    }
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const error = apiErrorSchema.safeParse(body);
      throw new ApiError(
        error.success ? error.data.error : 'Algo deu errado. Tente de novo em instantes.',
        response.status,
      );
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      throw new ApiError('A resposta do Trama veio num formato inesperado.', 502);
    return parsed.data;
  }

  return {
    list: () => call('/projects', z.array(projectSummarySchema)),
    create: (input) =>
      call('/projects', flowProjectSchema, { method: 'POST', body: JSON.stringify(input) }),
    get: (id) => call(`/projects/${encodeURIComponent(id)}`, flowProjectSchema),
    update: (id, patch) =>
      call(`/projects/${encodeURIComponent(id)}`, projectSummarySchema, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    // A API responde 204, sem corpo: o `call` lê como `undefined`.
    remove: (id) =>
      call(`/projects/${encodeURIComponent(id)}`, z.undefined(), { method: 'DELETE' }),
    save: (id, request, options) =>
      call(`/projects/${encodeURIComponent(id)}`, saveProjectResponseSchema, {
        method: 'PUT',
        body: JSON.stringify(request),
        // Ao fechar a aba, o navegador termina o pedido mesmo depois de a página sair.
        ...(options?.keepalive ? { keepalive: true } : {}),
      }),
  };
}

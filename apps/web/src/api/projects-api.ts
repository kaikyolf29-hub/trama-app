import {
  projectSchema,
  projectSummarySchema,
  saveProjectResponseSchema,
  type CreateAnyProjectRequest,
  type Project,
  type ProjectSummary,
  type SaveProjectRequest,
  type SaveScriptRequest,
  type SaveProjectResponse,
  type UpdateProjectRequest,
} from '@trama/core';
import { z } from 'zod';
import { ApiError, createCaller } from './http';

export { ApiError };

/** O que as telas usam da API de projetos (apps/api). */
export interface ProjectsApi {
  list(): Promise<ProjectSummary[]>;
  /** Cria um fluxo ou um roteiro (o tipo vem em `kind`). */
  create(input: CreateAnyProjectRequest): Promise<Project>;
  /** Abre o projeto com o conteúdo do tipo dele (`kind` diz qual). */
  get(id: string): Promise<Project>;
  /** Renomeia e/ou muda o status, sem mexer no conteúdo. */
  update(id: string, patch: UpdateProjectRequest): Promise<ProjectSummary>;
  remove(id: string): Promise<void>;
  save(
    id: string,
    request: SaveProjectRequest | SaveScriptRequest,
    options?: { keepalive?: boolean },
  ): Promise<SaveProjectResponse>;
}

/**
 * Cliente da API de projetos. Toda resposta passa pelos esquemas do `@trama/core`: se a API
 * mandar algo fora do contrato, a tela não recebe dado quebrado.
 */
export function createProjectsApi(config: {
  baseUrl: string;
  getToken: () => Promise<string | null>;
  fetch?: typeof fetch;
}): ProjectsApi {
  const call = createCaller(config);

  return {
    list: () => call('/projects', z.array(projectSummarySchema)),
    create: (input) =>
      call('/projects', projectSchema, { method: 'POST', body: JSON.stringify(input) }),
    get: (id) => call(`/projects/${encodeURIComponent(id)}`, projectSchema),
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

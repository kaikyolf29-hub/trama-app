import {
  flowProjectSchema,
  projectSummarySchema,
  saveProjectResponseSchema,
  scriptProjectSchema,
  type CreateFlowProjectRequest,
  type CreateScriptProjectRequest,
  type FlowProject,
  type ScriptProject,
  type ProjectSummary,
  type SaveProjectRequest,
  type SaveProjectResponse,
  type UpdateProjectRequest,
} from '@trama/core';
import { z } from 'zod';
import { ApiError, createCaller } from './http';

export { ApiError };

/** O que as telas usam da API de projetos (apps/api). */
export interface ProjectsApi {
  list(): Promise<ProjectSummary[]>;
  create(input: CreateFlowProjectRequest): Promise<FlowProject>;
  /** Cria um roteiro ("Falar e organizar" monta as cenas com a IA). */
  createScript(input: CreateScriptProjectRequest): Promise<ScriptProject>;
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
      call('/projects', flowProjectSchema, { method: 'POST', body: JSON.stringify(input) }),
    createScript: (input) =>
      call('/projects', scriptProjectSchema, { method: 'POST', body: JSON.stringify(input) }),
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

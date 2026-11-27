import {
  flowProjectSchema,
  projectSummarySchema,
  saveProjectResponseSchema,
  type CreateProjectRequest,
  type FlowProject,
  type ProjectSummary,
  type SaveProjectRequest,
  type SaveProjectResponse,
} from '@trama/core';
import { z } from 'zod';
import { ApiError, createCaller } from './http';

export { ApiError };

/** O que as telas usam da API de projetos (apps/api). */
export interface ProjectsApi {
  list(): Promise<ProjectSummary[]>;
  create(input: CreateProjectRequest): Promise<FlowProject>;
  get(id: string): Promise<FlowProject>;
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
    get: (id) => call(`/projects/${encodeURIComponent(id)}`, flowProjectSchema),
    save: (id, request, options) =>
      call(`/projects/${encodeURIComponent(id)}`, saveProjectResponseSchema, {
        method: 'PUT',
        body: JSON.stringify(request),
        // Ao fechar a aba, o navegador termina o pedido mesmo depois de a página sair.
        ...(options?.keepalive ? { keepalive: true } : {}),
      }),
  };
}

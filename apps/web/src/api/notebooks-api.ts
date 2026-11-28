import {
  notebookListSchema,
  notebookProjectSchema,
  type CreateNotebookRequest,
  type NotebookProject,
  type UpdateNotebookRequest,
} from '@trama/core';
import { z } from 'zod';
import { createCaller } from './http';

/** O que a tela Estudos usa da API dos cadernos (rotas `/notebooks`). */
export interface NotebooksApi {
  list(): Promise<NotebookProject[]>;
  get(id: string): Promise<NotebookProject>;
  create(input: CreateNotebookRequest): Promise<NotebookProject>;
  /** Renomeia ou muda descrição, cor e intervalo de revisão; devolve o caderno já atualizado. */
  update(id: string, patch: UpdateNotebookRequest): Promise<NotebookProject>;
  /** Apaga o caderno e, junto, as aulas dele. */
  remove(id: string): Promise<void>;
}

/** Cliente dos cadernos. Toda resposta passa pelos esquemas do `@trama/core`. */
export function createNotebooksApi(config: Parameters<typeof createCaller>[0]): NotebooksApi {
  const call = createCaller(config);
  const path = (id: string) => `/notebooks/${encodeURIComponent(id)}`;

  return {
    list: () => call('/notebooks', notebookListSchema),
    get: (id) => call(path(id), notebookProjectSchema),
    create: (input) =>
      call('/notebooks', notebookProjectSchema, { method: 'POST', body: JSON.stringify(input) }),
    update: (id, patch) =>
      call(path(id), notebookProjectSchema, { method: 'PATCH', body: JSON.stringify(patch) }),
    // Um caderno é um projeto: apagar é a mesma rota, e a API responde 204.
    remove: (id) =>
      call(`/projects/${encodeURIComponent(id)}`, z.undefined(), { method: 'DELETE' }),
  };
}

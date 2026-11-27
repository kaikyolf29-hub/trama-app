import {
  createEmptyFlow,
  flowContentSchema,
  type CreateProjectRequest,
  type FlowProject,
  type SaveProjectRequest,
  type UpdateProjectRequest,
} from '@trama/core';
import { vi } from 'vitest';
import { ApiError, type ProjectsApi } from '../api/projects-api';

type Operation = 'list' | 'create' | 'update' | 'remove' | 'save';

/** API de projetos em memória para os testes das telas. */
export function createFakeProjects(initial: FlowProject[] = []) {
  const projects = new Map(initial.map((project) => [project.id, project]));
  const saves: { id: string; request: SaveProjectRequest }[] = [];
  const failures = new Map<Operation, string>();
  let counter = 0;
  // Sempre a partir de agora, para o que for editado aqui ficar mais recente que os projetos de teste.
  const now = () => new Date(Date.now() + counter++ * 1000).toISOString();

  /** Se a próxima chamada dessa operação deve falhar, devolve o erro (e gasta a falha). */
  const failure = (operation: Operation): ApiError | null => {
    const message = failures.get(operation);
    if (message === undefined) return null;
    failures.delete(operation);
    return new ApiError(message, 0);
  };

  const summary = ({ id, kind, title, status, revision, updatedAt }: FlowProject) => ({
    id,
    kind,
    title,
    status,
    revision,
    updatedAt,
  });

  // Fora do `api` para os testes poderem conferir as chamadas (`expect(fake.update)`).
  const update = vi.fn((id: string, patch: UpdateProjectRequest) => {
    const error = failure('update');
    if (error) return Promise.reject(error);
    const project = projects.get(id);
    if (!project) return Promise.reject(new ApiError('Projeto não encontrado.', 404));
    const updated = { ...project, ...patch, updatedAt: now() };
    projects.set(id, updated);
    return Promise.resolve(summary(updated));
  });
  const remove = vi.fn((id: string) => {
    const error = failure('remove');
    if (error) return Promise.reject(error);
    return projects.delete(id)
      ? Promise.resolve()
      : Promise.reject(new ApiError('Projeto não encontrado.', 404));
  });

  const api: ProjectsApi = {
    list: vi.fn(() => {
      const error = failure('list');
      if (error) return Promise.reject(error);
      // Como a API: o mais recente primeiro.
      return Promise.resolve(
        [...projects.values()]
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .map((project) => summary(project)),
      );
    }),
    create: vi.fn(({ title = 'Sem título', content }: CreateProjectRequest) => {
      const error = failure('create');
      if (error) return Promise.reject(error);
      const at = now();
      const project: FlowProject = {
        id: crypto.randomUUID(),
        kind: 'flow',
        title,
        status: 'draft',
        revision: 1,
        driveFileId: null,
        createdAt: at,
        updatedAt: at,
        content: content ? flowContentSchema.parse(content) : createEmptyFlow(),
      };
      projects.set(project.id, project);
      return Promise.resolve(project);
    }),
    get: vi.fn((id: string) => {
      const project = projects.get(id);
      return project
        ? Promise.resolve(project)
        : Promise.reject(new ApiError('Projeto não encontrado.', 404));
    }),
    update,
    remove,
    save: vi.fn((id: string, request: SaveProjectRequest) => {
      const error = failure('save');
      if (error) return Promise.reject(error);
      const project = projects.get(id);
      if (!project) return Promise.reject(new ApiError('Projeto não encontrado.', 404));
      saves.push({ id, request });
      const saved = {
        ...project,
        content: request.content,
        revision: project.revision + 1,
        updatedAt: now(),
      };
      projects.set(id, saved);
      return Promise.resolve({
        revision: saved.revision,
        updatedAt: saved.updatedAt,
        overwrote: request.baseRevision !== project.revision,
      });
    }),
  };

  return {
    api,
    update,
    remove,
    projects,
    saves,
    /** A próxima chamada da operação falha com esta mensagem (só uma vez). */
    failNext(operation: Operation, message: string) {
      failures.set(operation, message);
    },
    failNextSave(message: string) {
      failures.set('save', message);
    },
  };
}

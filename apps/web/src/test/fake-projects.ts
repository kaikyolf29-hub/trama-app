import {
  createEmptyFlow,
  flowContentSchema,
  type CreateProjectRequest,
  type FlowProject,
  type SaveProjectRequest,
} from '@trama/core';
import { vi } from 'vitest';
import { ApiError, type ProjectsApi } from '../api/projects-api';

/** API de projetos em memória para os testes das telas. */
export function createFakeProjects(initial: FlowProject[] = []) {
  const projects = new Map(initial.map((project) => [project.id, project]));
  const saves: { id: string; request: SaveProjectRequest }[] = [];
  let failNextSave: string | null = null;
  let counter = 0;
  const now = () => new Date(Date.UTC(2026, 10, 27, 12, 0, counter++)).toISOString();

  const api: ProjectsApi = {
    list: vi.fn(() =>
      Promise.resolve(
        [...projects.values()].map(({ id, kind, title, status, revision, updatedAt }) => ({
          id,
          kind,
          title,
          status,
          revision,
          updatedAt,
        })),
      ),
    ),
    create: vi.fn(({ title = 'Sem título', content }: CreateProjectRequest) => {
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
    save: vi.fn((id: string, request: SaveProjectRequest) => {
      if (failNextSave) {
        const message = failNextSave;
        failNextSave = null;
        return Promise.reject(new ApiError(message, 0));
      }
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
    projects,
    saves,
    failNextSave(message: string) {
      failNextSave = message;
    },
  };
}

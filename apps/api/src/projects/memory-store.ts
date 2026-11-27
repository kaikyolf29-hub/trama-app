import type { ProjectVersion } from '@trama/core';
import type { ProjectStore, StoredProject } from './store';

/**
 * Armazém em memória com as mesmas regras do banco (save_project): revisão sobe a cada
 * gravação, conflito guarda a gravação substituída. Só para testes.
 */
export function createMemoryStore(clock: () => Date = () => new Date()): ProjectStore & {
  projects: Map<string, StoredProject>;
} {
  const projects = new Map<string, StoredProject>();
  const versions = new Map<string, (ProjectVersion & { content: unknown })[]>();
  let nextVersion = 1;
  const now = () => clock().toISOString();
  const keep = (id: string, project: StoredProject, reason: ProjectVersion['reason']) => {
    const list = versions.get(id) ?? [];
    list.unshift({
      id: nextVersion++,
      revision: project.revision,
      reason,
      savedAt: now(),
      content: project.content,
    });
    versions.set(id, list);
  };

  return {
    projects,
    list: () =>
      Promise.resolve(
        [...projects.values()]
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .map(({ id, kind, title, status, revision, updatedAt }) => ({
            id,
            kind,
            title,
            status,
            revision,
            updatedAt,
          })),
      ),
    get: (id) => Promise.resolve(projects.get(id) ?? null),
    create: ({ kind, title, content }) => {
      const at = now();
      const project: StoredProject = {
        id: crypto.randomUUID(),
        kind,
        title,
        status: 'draft',
        revision: 1,
        driveFileId: null,
        createdAt: at,
        updatedAt: at,
        content,
      };
      projects.set(project.id, project);
      return Promise.resolve(project);
    },
    save: (id, { content, title, baseRevision }) => {
      const project = projects.get(id);
      if (!project) return Promise.resolve(null);
      const overwrote = project.revision !== baseRevision;
      if (overwrote) keep(id, project, 'conflict');
      else if ((versions.get(id) ?? []).length === 0) keep(id, project, 'autosave');
      const saved = {
        ...project,
        content,
        title: title ?? project.title,
        revision: project.revision + 1,
        updatedAt: now(),
      };
      projects.set(id, saved);
      return Promise.resolve({ revision: saved.revision, updatedAt: saved.updatedAt, overwrote });
    },
    setDriveFileId: (id, driveFileId) => {
      const project = projects.get(id);
      if (project) projects.set(id, { ...project, driveFileId });
      return Promise.resolve();
    },
    remove: (id) => Promise.resolve(projects.delete(id)),
    versions: (id) =>
      Promise.resolve(
        projects.has(id)
          ? (versions.get(id) ?? []).map(({ id: versionId, revision, reason, savedAt }) => ({
              id: versionId,
              revision,
              reason,
              savedAt,
            }))
          : null,
      ),
    restore: (id, versionId) => {
      const project = projects.get(id);
      const version = (versions.get(id) ?? []).find((v) => v.id === versionId);
      if (!project || !version) return Promise.resolve(null);
      keep(id, project, 'restore');
      const restored = {
        ...project,
        content: version.content,
        revision: project.revision + 1,
        updatedAt: now(),
      };
      projects.set(id, restored);
      return Promise.resolve({ revision: restored.revision, updatedAt: restored.updatedAt });
    },
  };
}

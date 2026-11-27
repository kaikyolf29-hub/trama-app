import { describe, expect, it } from 'vitest';
import { videoFlowExample } from './fixtures';
import { createEmptyFlow } from './flow';
import { projectSchema } from './project';

const base = {
  id: '6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f',
  title: 'Como editar 10x mais rápido',
  createdAt: '2026-11-12T14:32:00-03:00',
  updatedAt: '2026-11-12T19:40:00-03:00',
};

describe('projectSchema', () => {
  it('aceita um projeto de fluxo e preenche os padrões', () => {
    const project = projectSchema.parse({ ...base, kind: 'flow', content: videoFlowExample });
    expect(project.kind).toBe('flow');
    expect(project.status).toBe('draft');
    expect(project.driveFileId).toBeNull();
  });

  it('valida o conteúdo de acordo com o tipo', () => {
    expect(
      projectSchema.safeParse({ ...base, kind: 'flow', content: { schemaVersion: 1, blocks: 'x' } })
        .success,
    ).toBe(false);
  });

  it('aceita roteiro e caderno com conteúdo livre até a V1', () => {
    expect(projectSchema.safeParse({ ...base, kind: 'script', content: {} }).success).toBe(true);
    expect(projectSchema.safeParse({ ...base, kind: 'notebook', content: {} }).success).toBe(true);
  });

  it('recusa título vazio, id que não é uuid e data sem fuso', () => {
    const flow = { kind: 'flow', content: createEmptyFlow() };
    expect(projectSchema.safeParse({ ...base, ...flow, title: '   ' }).success).toBe(false);
    expect(projectSchema.safeParse({ ...base, ...flow, id: '123' }).success).toBe(false);
    expect(
      projectSchema.safeParse({ ...base, ...flow, createdAt: '2026-11-12 14:32' }).success,
    ).toBe(false);
  });

  it('recusa tipo de projeto desconhecido', () => {
    expect(projectSchema.safeParse({ ...base, kind: 'planilha', content: {} }).success).toBe(false);
  });
});

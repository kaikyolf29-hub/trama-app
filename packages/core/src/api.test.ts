import { describe, expect, it } from 'vitest';
import {
  createProjectRequestSchema,
  projectSummarySchema,
  projectVersionSchema,
  saveProjectRequestSchema,
  saveProjectResponseSchema,
  updateProjectRequestSchema,
} from './api';
import { videoFlowExample } from './fixtures';
import { createEmptyFlow } from './flow';
import { projectSchema } from './project';

const id = '6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f';

describe('contrato da API de projetos', () => {
  it('cria fluxo com título padrão e conteúdo opcional', () => {
    expect(createProjectRequestSchema.parse({ kind: 'flow' })).toEqual({
      kind: 'flow',
      title: 'Sem título',
    });
    const withContent = createProjectRequestSchema.parse({
      kind: 'flow',
      title: '  Vídeo novo  ',
      content: videoFlowExample,
    });
    expect(withContent.title).toBe('Vídeo novo');
    expect(withContent.kind === 'flow' && withContent.content?.blocks.length).toBeGreaterThan(0);
  });

  it('cria roteiro, com cenas ou vazio, mas ainda não caderno', () => {
    expect(createProjectRequestSchema.parse({ kind: 'script' })).toEqual({
      kind: 'script',
      title: 'Sem título',
    });
    const scene = { id: 'c1', title: 'Gancho', narration: 'Oi' };
    const withScenes = createProjectRequestSchema.parse({
      kind: 'script',
      title: 'Roteiro',
      content: { scenes: [scene] },
    });
    expect(withScenes.kind === 'script' && withScenes.content?.scenes).toHaveLength(1);
    // Cada tipo valida o conteúdo dele: um fluxo não passa como roteiro, e o contrário também.
    expect(
      createProjectRequestSchema.safeParse({
        kind: 'script',
        content: { scenes: [scene, scene] },
      }).success,
    ).toBe(false);
    expect(createProjectRequestSchema.safeParse({ kind: 'notebook' }).success).toBe(false);
  });

  it('salvar exige conteúdo válido e a revisão de base', () => {
    const content = createEmptyFlow();
    expect(saveProjectRequestSchema.safeParse({ content, baseRevision: 3 }).success).toBe(true);
    expect(saveProjectRequestSchema.safeParse({ content }).success).toBe(false);
    expect(saveProjectRequestSchema.safeParse({ content, baseRevision: 0 }).success).toBe(false);
    expect(
      saveProjectRequestSchema.safeParse({
        content: { ...content, arrows: [{ id: 'a', from: { nodeId: 'x' }, to: { nodeId: 'y' } }] },
        baseRevision: 1,
      }).success,
    ).toBe(false);
  });

  it('renomear e mudar o status aceitam um campo, o outro ou os dois', () => {
    expect(updateProjectRequestSchema.parse({ title: '  Aula 1  ' })).toEqual({ title: 'Aula 1' });
    expect(updateProjectRequestSchema.parse({ status: 'done' })).toEqual({ status: 'done' });
    expect(updateProjectRequestSchema.parse({ title: 'Aula', status: 'in_progress' })).toEqual({
      title: 'Aula',
      status: 'in_progress',
    });
  });

  it('renomear e mudar o status recusam corpo vazio, título em branco e status desconhecido', () => {
    expect(updateProjectRequestSchema.safeParse({}).success).toBe(false);
    expect(updateProjectRequestSchema.safeParse({ title: '   ' }).success).toBe(false);
    expect(updateProjectRequestSchema.safeParse({ title: 'a'.repeat(201) }).success).toBe(false);
    expect(updateProjectRequestSchema.safeParse({ status: 'arquivado' }).success).toBe(false);
  });

  it('descreve a resposta de salvar, o resumo e a versão', () => {
    expect(
      saveProjectResponseSchema.parse({
        revision: 4,
        updatedAt: '2026-11-27T08:30:00Z',
        overwrote: false,
      }).revision,
    ).toBe(4);
    expect(
      projectSummarySchema.safeParse({
        id,
        kind: 'flow',
        title: 'Vídeo',
        status: 'draft',
        revision: 1,
        updatedAt: '2026-11-27T08:30:00+00:00',
      }).success,
    ).toBe(true);
    expect(
      projectVersionSchema.safeParse({
        id: 7,
        revision: 3,
        reason: 'conflict',
        savedAt: '2026-11-27T08:30:00Z',
      }).success,
    ).toBe(true);
  });

  it('o projeto começa na revisão 1', () => {
    const project = projectSchema.parse({
      id,
      kind: 'flow',
      title: 'Vídeo',
      content: createEmptyFlow(),
      createdAt: '2026-11-27T08:30:00Z',
      updatedAt: '2026-11-27T08:30:00Z',
    });
    expect(project.revision).toBe(1);
  });
});

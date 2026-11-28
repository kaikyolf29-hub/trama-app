import { describe, expect, it } from 'vitest';
import {
  createTramaFile,
  driveFileIdSchema,
  driveImportRequestSchema,
  driveStatusSchema,
  parseTramaFile,
  tramaFileSchema,
} from './drive';
import { videoFlowExample } from './fixtures';
import { createEmptyFlow, flowContentSchema } from './flow';

const id = '6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f';
const at = '2026-11-27T12:00:00.000Z';

const project = {
  id,
  title: 'Como editar 10x mais rápido',
  status: 'draft' as const,
  createdAt: at,
  updatedAt: at,
  content: flowContentSchema.parse(videoFlowExample),
};

describe('arquivo projeto.trama', () => {
  it('o que sai de createTramaFile volta pelo parseTramaFile', () => {
    const text = JSON.stringify(createTramaFile(project, at));
    const parsed = parseTramaFile(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.file.project).toMatchObject({ id, kind: 'flow', title: project.title });
    expect(parsed.file.content.blocks.length).toBe(videoFlowExample.blocks.length);
  });

  it('recusa JSON quebrado, formato errado e fluxo inválido, com frase em português', () => {
    expect(parseTramaFile('{ não é json')).toEqual({
      ok: false,
      error: 'Este arquivo não é um projeto do Trama.',
    });
    const file = createTramaFile({ ...project, content: createEmptyFlow() }, at);
    expect(parseTramaFile(JSON.stringify({ ...file, format: 'outro' })).ok).toBe(false);
    expect(parseTramaFile(JSON.stringify({ ...file, version: 2 })).ok).toBe(false);
    // Seta apontando para um nó que não existe: o core recusa, como em toda gravação.
    const broken = {
      ...file,
      content: {
        ...file.content,
        arrows: [
          {
            id: 'a1',
            from: { nodeId: 'nao-existe' },
            to: { nodeId: 'tambem-nao' },
          },
        ],
      },
    };
    expect(tramaFileSchema.safeParse(broken).success).toBe(false);
  });

  it('só aceita fluxo por enquanto', () => {
    const file = createTramaFile(project, at);
    const notebook = { ...file, project: { ...file.project, kind: 'notebook' } };
    expect(tramaFileSchema.safeParse(notebook).success).toBe(false);
  });
});

describe('contrato do Drive', () => {
  it('o id de arquivo não deixa passar barra, ponto nem espaço', () => {
    expect(driveFileIdSchema.safeParse('1AbC_dEf-GhIjKlMnOp').success).toBe(true);
    expect(driveFileIdSchema.safeParse('../about').success).toBe(false);
    expect(driveFileIdSchema.safeParse('abc def ghi').success).toBe(false);
    expect(driveImportRequestSchema.safeParse({}).success).toBe(false);
  });

  it('o estado desconectado é válido', () => {
    expect(
      driveStatusSchema.safeParse({
        available: true,
        connected: false,
        email: null,
        folderUrl: null,
        lastCopyAt: null,
        consecutiveFailures: 0,
        lastError: null,
      }).success,
    ).toBe(true);
  });
});

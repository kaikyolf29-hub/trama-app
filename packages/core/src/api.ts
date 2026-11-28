import { z } from 'zod';
import { flowContentSchema } from './flow';
import { notebookContentSchema } from './notebook';
import { projectKindSchema, projectTitleSchema } from './project';
import { scriptContentSchema } from './script';
import { dateTimeSchema, projectStatusSchema } from './status';

/**
 * Contrato da API de projetos (Worker `apps/api`), usado pelo site e, depois, pelo MCP.
 * Toda entrada é validada com estes esquemas dos dois lados.
 */

const revisionSchema = z.number().int().positive();

/** O que a lista de projetos mostra (sem o conteúdo). */
export const projectSummarySchema = z.object({
  id: z.uuid(),
  kind: projectKindSchema,
  title: projectTitleSchema,
  status: projectStatusSchema,
  revision: revisionSchema,
  updatedAt: dateTimeSchema,
});

/** Criar fluxo (o que o site faz). Roteiros e cadernos: `createAnyProjectRequestSchema`. */
export const createProjectRequestSchema = z.object({
  kind: z.literal('flow'),
  title: projectTitleSchema.default('Sem título'),
  /** Conteúdo inicial (um modelo de início); sem ele, o fluxo começa vazio. */
  content: flowContentSchema.optional(),
});

/** Criar um roteiro (só o conector MCP usa por enquanto). Sem conteúdo, nasce vazio. */
export const createScriptRequestSchema = z.object({
  kind: z.literal('script'),
  title: projectTitleSchema.default('Sem título'),
  content: scriptContentSchema.optional(),
});

/** Criar um caderno de Estudos (só o conector MCP usa por enquanto). Sem conteúdo, nasce vazio. */
export const createNotebookRequestSchema = z.object({
  kind: z.literal('notebook'),
  title: projectTitleSchema.default('Sem título'),
  content: notebookContentSchema.optional(),
});

/**
 * `POST /projects` aceita os três tipos. O site continua criando só fluxos (`createProjectRequestSchema`,
 * acima); roteiros e cadernos chegam pelo conector MCP (etapa 3.4) e pelos editores da V1.
 */
export const createAnyProjectRequestSchema = z.discriminatedUnion('kind', [
  createProjectRequestSchema,
  createScriptRequestSchema,
  createNotebookRequestSchema,
]);

/**
 * Renomear ou mudar o status (`PATCH /projects/:id`) sem mexer no conteúdo nem na revisão:
 * serve à lista do Início, que não tem o conteúdo em mãos. Ao menos um dos campos é obrigatório.
 */
export const updateProjectRequestSchema = z
  .object({
    title: projectTitleSchema.optional(),
    status: projectStatusSchema.optional(),
  })
  .refine((body) => body.title !== undefined || body.status !== undefined, {
    message: 'informe o título ou o status',
  });

/**
 * Salvar o fluxo. `baseRevision` é a revisão que o site tinha quando a pessoa começou a mexer:
 * se o projeto mudou em outro lugar desde então, vale a versão mais nova (esta), e a outra vai
 * para o histórico de versões (docs/PLAN.md, "Google Drive").
 */
export const saveProjectRequestSchema = z.object({
  content: flowContentSchema,
  title: projectTitleSchema.optional(),
  baseRevision: revisionSchema,
});

export const saveProjectResponseSchema = z.object({
  revision: revisionSchema,
  updatedAt: dateTimeSchema,
  /** true quando outra gravação mais nova foi substituída (e guardada no histórico). */
  overwrote: z.boolean(),
});

/** Por que uma versão foi guardada: de tempos em tempos, por conflito ou antes de restaurar. */
export const versionReasonSchema = z.enum(['autosave', 'conflict', 'restore']);

export const versionReasonLabels: Record<z.infer<typeof versionReasonSchema>, string> = {
  autosave: 'Salva automaticamente',
  conflict: 'Substituída por outra gravação',
  restore: 'Antes de restaurar',
};

/** Uma versão antiga, na lista do histórico (sem o conteúdo). */
export const projectVersionSchema = z.object({
  id: z.number().int().positive(),
  revision: revisionSchema,
  reason: versionReasonSchema,
  savedAt: dateTimeSchema,
});

/** Corpo de toda resposta de erro da API: uma frase em português para mostrar à pessoa. */
export const apiErrorSchema = z.object({ error: z.string().min(1) });

export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type CreateProjectRequest = z.input<typeof createProjectRequestSchema>;
export type CreateAnyProjectRequest = z.input<typeof createAnyProjectRequestSchema>;
export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>;
export type SaveProjectRequest = z.infer<typeof saveProjectRequestSchema>;
export type SaveProjectResponse = z.infer<typeof saveProjectResponseSchema>;
export type VersionReason = z.infer<typeof versionReasonSchema>;
export type ProjectVersion = z.infer<typeof projectVersionSchema>;

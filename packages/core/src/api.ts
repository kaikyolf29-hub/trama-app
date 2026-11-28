import { z } from 'zod';
import { flowContentSchema } from './flow';
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

/** Criar um fluxo (`POST /projects`). */
export const createFlowProjectRequestSchema = z.object({
  kind: z.literal('flow'),
  title: projectTitleSchema.default('Sem título'),
  /** Conteúdo inicial (um modelo de início); sem ele, o fluxo começa vazio. */
  content: flowContentSchema.optional(),
});

/** Criar um roteiro (etapa 3.3: "Falar e organizar" cria o roteiro com as cenas da IA). */
export const createScriptProjectRequestSchema = z.object({
  kind: z.literal('script'),
  title: projectTitleSchema.default('Sem título'),
  /** Cenas iniciais; sem elas, o roteiro começa vazio. */
  content: scriptContentSchema.optional(),
});

/** Criar projeto: fluxo ou roteiro. O caderno de estudos ainda não se cria pela API. */
export const createProjectRequestSchema = z.discriminatedUnion('kind', [
  createFlowProjectRequestSchema,
  createScriptProjectRequestSchema,
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
export type CreateFlowProjectRequest = z.input<typeof createFlowProjectRequestSchema>;
export type CreateScriptProjectRequest = z.input<typeof createScriptProjectRequestSchema>;
export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>;
export type SaveProjectRequest = z.infer<typeof saveProjectRequestSchema>;
export type SaveProjectResponse = z.infer<typeof saveProjectResponseSchema>;
export type VersionReason = z.infer<typeof versionReasonSchema>;
export type ProjectVersion = z.infer<typeof projectVersionSchema>;

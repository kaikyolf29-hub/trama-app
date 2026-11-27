import { z } from 'zod';
import { flowContentSchema } from './flow';
import { dateTimeSchema, projectStatusSchema } from './status';

/** Título de projeto: sem espaços nas pontas, de 1 a 200 letras. */
export const projectTitleSchema = z.string().trim().min(1).max(200);

/** Tipos de projeto: fluxo (quadro), roteiro e caderno de estudos. */
export const projectKindSchema = z.enum(['flow', 'script', 'notebook']);
export type ProjectKind = z.infer<typeof projectKindSchema>;

export const projectKindLabels: Record<ProjectKind, string> = {
  flow: 'Fluxo',
  script: 'Roteiro',
  notebook: 'Caderno',
};

/** Campos comuns, espelhando a tabela `projects` (docs/PLAN.md, "Tabelas principais"). */
const projectBase = {
  id: z.uuid(),
  title: projectTitleSchema,
  status: projectStatusSchema.default('draft'),
  /** Id do arquivo projeto.trama no Google Drive da pessoa; null até a primeira cópia. */
  driveFileId: z.string().min(1).nullable().default(null),
  /** Sobe 1 a cada gravação; quem salva diz em qual revisão se baseou (veja `api.ts`). */
  revision: z.number().int().positive().default(1),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
};

export const flowProjectSchema = z.object({
  ...projectBase,
  kind: z.literal('flow'),
  content: flowContentSchema,
});

/** Roteiros entram na V1; o formato do conteúdo será definido lá. */
export const scriptProjectSchema = z.object({
  ...projectBase,
  kind: z.literal('script'),
  content: z.record(z.string(), z.unknown()),
});

/** Cadernos de Estudos entram na V1; o formato do conteúdo será definido lá. */
export const notebookProjectSchema = z.object({
  ...projectBase,
  kind: z.literal('notebook'),
  content: z.record(z.string(), z.unknown()),
});

export const projectSchema = z.discriminatedUnion('kind', [
  flowProjectSchema,
  scriptProjectSchema,
  notebookProjectSchema,
]);

export type Project = z.infer<typeof projectSchema>;
export type ProjectInput = z.input<typeof projectSchema>;
export type FlowProject = z.infer<typeof flowProjectSchema>;

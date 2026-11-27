import { z } from 'zod';
import { flowContentSchema, type FlowContent } from './flow';
import { projectTitleSchema } from './project';
import { dateTimeSchema, projectStatusSchema, type ProjectStatus } from './status';

/**
 * Google Drive (etapa 1.6, docs/PLAN.md, "Dados, contas e Google Drive"): o arquivo
 * `projeto.trama` que a cópia grava na pasta "Trama" e os pedidos da API do Drive.
 */

/** Versão do envelope do arquivo `.trama` (o conteúdo tem a própria, `FLOW_SCHEMA_VERSION`). */
export const TRAMA_FILE_VERSION = 1;

/** Nome do arquivo dentro da subpasta de cada projeto, e o tipo que o Drive guarda. */
export const TRAMA_FILE_NAME = 'projeto.trama';
export const TRAMA_FILE_MIME_TYPE = 'application/json';

/**
 * O arquivo `projeto.trama`: um JSON que a pessoa pode baixar, mover ou abrir de novo no app.
 * Só fluxos por enquanto; roteiros e cadernos entram com a V1.
 */
export const tramaFileSchema = z.object({
  format: z.literal('trama'),
  version: z.literal(TRAMA_FILE_VERSION),
  /** Quando esta cópia foi gravada no Drive. */
  savedAt: dateTimeSchema,
  project: z.object({
    id: z.uuid(),
    kind: z.literal('flow'),
    title: projectTitleSchema,
    status: projectStatusSchema.default('draft'),
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema,
  }),
  content: flowContentSchema,
});

export type TramaFile = z.infer<typeof tramaFileSchema>;

/** Monta o arquivo a partir de um projeto do tipo fluxo. */
export function createTramaFile(
  project: {
    id: string;
    title: string;
    status: ProjectStatus;
    createdAt: string;
    updatedAt: string;
    content: FlowContent;
  },
  savedAt: string,
): TramaFile {
  return {
    format: 'trama',
    version: TRAMA_FILE_VERSION,
    savedAt,
    project: {
      id: project.id,
      kind: 'flow',
      title: project.title,
      status: project.status,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
    content: project.content,
  };
}

/** Lê o texto de um `.trama`: JSON quebrado ou fora do contrato vira um erro em português. */
export function parseTramaFile(
  text: string,
): { ok: true; file: TramaFile } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Este arquivo não é um projeto do Trama.' };
  }
  const parsed = tramaFileSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: 'Este arquivo não é um projeto do Trama que eu consiga abrir.' };
  }
  return { ok: true, file: parsed.data };
}

/** Estado da conexão com o Drive, para a tela Início e o aviso do quadro. */
export const driveStatusSchema = z.object({
  connected: z.boolean(),
  /** Conta do Google conectada. */
  email: z.string().nullable(),
  /** Endereço da pasta "Trama" no Drive, quando já existe. */
  folderUrl: z.string().nullable(),
  lastCopyAt: dateTimeSchema.nullable(),
  /** Cópias que falharam em seguida; o aviso por e-mail sai na terceira. */
  consecutiveFailures: z.number().int().min(0),
  lastError: z.string().nullable(),
});

/** Começar a conectar: `returnTo` é para onde a pessoa volta depois (um caminho do site). */
export const driveConnectRequestSchema = z.object({
  returnTo: z.string().max(500).optional(),
});

/** O endereço da tela de consentimento do Google, para o site abrir. */
export const driveConnectResponseSchema = z.object({ url: z.url() });

/**
 * O site devolve à API o bilhete que o retorno do Google gerou (o refresh token, criptografado
 * e preso à pessoa). É o que deixa a API guardar a conexão com o token de login da pessoa e a
 * RLS, sem a chave secreta do Supabase.
 */
export const driveFinishRequestSchema = z.object({ ticket: z.string().min(20).max(4000) });

/** Resultado de uma cópia do projeto para o Drive. */
export const driveCopyResponseSchema = z.object({
  driveFileId: z.string().min(1),
  copiedAt: dateTimeSchema,
});

/** Token de acesso curto para o seletor de arquivos do Google (Picker), só no navegador. */
export const drivePickerTokenSchema = z.object({
  accessToken: z.string().min(1),
  /** Segundos até o token vencer. */
  expiresIn: z.number().int().positive(),
});

/** Id de arquivo do Google Drive: letras, números, "_" e "-". */
export const driveFileIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/);

/** "Abrir do Drive": o arquivo que a pessoa escolheu no Picker. */
export const driveImportRequestSchema = z.object({ fileId: driveFileIdSchema });

export const driveImportResponseSchema = z.object({
  projectId: z.uuid(),
  /** true quando virou um projeto novo; false quando atualizou um que já existia. */
  created: z.boolean(),
  /** true quando o conteúdo anterior ficou guardado no histórico de versões. */
  replacedPrevious: z.boolean(),
});

/** Resposta de `POST /account/welcome`: o e-mail só sai na primeira vez. */
export const welcomeResponseSchema = z.object({ sent: z.boolean() });

export type DriveStatus = z.infer<typeof driveStatusSchema>;
export type DriveConnectRequest = z.infer<typeof driveConnectRequestSchema>;
export type DriveCopyResponse = z.infer<typeof driveCopyResponseSchema>;
export type DrivePickerToken = z.infer<typeof drivePickerTokenSchema>;
export type DriveImportResponse = z.infer<typeof driveImportResponseSchema>;

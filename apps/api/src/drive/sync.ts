import {
  createTramaFile,
  flowContentSchema,
  parseTramaFile,
  TRAMA_FILE_NAME,
  type DriveImportResponse,
} from '@trama/core';
import type { ProjectStore, StoredProject } from '../projects/store';
import { GoogleError, MAX_TRAMA_FILE_BYTES, type Google } from './google';
import type { DriveConnection, DriveStore } from './store';
import { openRefreshToken } from './tickets';
import type { Vault } from './vault';

/** Nome da pasta de cima, no Drive da pessoa (docs/PLAN.md: pasta "Trama"). */
export const ROOT_FOLDER_NAME = 'Trama';

/** O conteúdo do projeto não passou pela validação do core; não vai para o Drive. */
export class InvalidProjectError extends Error {
  constructor() {
    super('conteúdo do projeto inválido');
    this.name = 'InvalidProjectError';
  }
}

/** O `.trama` escolhido não presta (grande demais, JSON quebrado ou fora do contrato). */
export class InvalidFileError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 413 | 422,
  ) {
    super(message);
    this.name = 'InvalidFileError';
  }
}

interface Context {
  google: Google;
  vault: Vault;
  drive: DriveStore;
  projects: ProjectStore;
  /** Dona da conexão: o id dela é o dado associado do token cifrado. */
  uid: string;
  connection: DriveConnection;
  now: Date;
}

/** Troca o refresh token guardado (cifrado) por um token de acesso de curta duração. */
export async function accessTokenFor(
  ctx: Pick<Context, 'google' | 'vault' | 'uid' | 'connection'>,
) {
  const refreshToken = await openRefreshToken(
    ctx.vault,
    ctx.uid,
    ctx.connection.refreshTokenEncrypted,
  );
  return ctx.google.refresh(refreshToken);
}

/** Pasta "Trama": a guardada, se ainda existe; senão uma que o app já criou; senão uma nova. */
async function ensureRootFolder(ctx: Context, accessToken: string): Promise<string> {
  const saved = ctx.connection.rootFolderId;
  if (saved) {
    const folder = await ctx.google.getFile(accessToken, saved);
    if (folder && !folder.trashed) return folder.id;
  }
  const found = await ctx.google.findFolder(accessToken, ROOT_FOLDER_NAME);
  const folder = found ?? (await ctx.google.createFolder(accessToken, ROOT_FOLDER_NAME));
  await ctx.drive.setRootFolder(folder.id);
  ctx.connection.rootFolderId = folder.id;
  return folder.id;
}

/** O Drive não aceita "/" nem nomes vazios de um jeito amigável; deixa o nome simples. */
function folderName(title: string): string {
  return (
    title
      .replaceAll(/[\\/\p{Cc}]/gu, ' ')
      .trim()
      .slice(0, 100) || 'Sem título'
  );
}

/**
 * Copia o projeto para o Drive. Na primeira vez cria a pasta "Trama" (se ainda não existe), a
 * subpasta do projeto e o `projeto.trama`; depois só troca o conteúdo desse arquivo. Se a pessoa
 * apagou o arquivo no Drive, cria de novo.
 */
export async function copyProjectToDrive(
  ctx: Context,
  project: StoredProject,
): Promise<{ driveFileId: string; copiedAt: string }> {
  const content = flowContentSchema.safeParse(project.content);
  if (!content.success) throw new InvalidProjectError();
  const copiedAt = ctx.now.toISOString();
  const body = JSON.stringify(
    createTramaFile({ ...project, content: content.data }, copiedAt),
    null,
    2,
  );
  if (new TextEncoder().encode(body).length > MAX_TRAMA_FILE_BYTES) throw new InvalidProjectError();

  const { accessToken } = await accessTokenFor(ctx);

  let fileId: string | null = null;
  if (project.driveFileId) {
    const updated = await ctx.google.updateFile(accessToken, project.driveFileId, body);
    if (updated && !updated.trashed) fileId = updated.id;
  }
  if (!fileId) {
    const rootId = await ensureRootFolder(ctx, accessToken);
    const folder = await ctx.google.createFolder(accessToken, folderName(project.title), rootId);
    const file = await ctx.google.createFile(accessToken, {
      name: TRAMA_FILE_NAME,
      parentId: folder.id,
      body,
    });
    fileId = file.id;
  }
  if (fileId !== project.driveFileId) await ctx.projects.setDriveFileId(project.id, fileId);
  return { driveFileId: fileId, copiedAt };
}

/**
 * "Abrir do Drive": lê o `projeto.trama` que a pessoa escolheu no Picker, valida com o core e
 * vira projeto novo, ou atualiza o projeto de mesmo id (o conteúdo de antes vai para o histórico).
 */
export async function importFromDrive(ctx: Context, fileId: string): Promise<DriveImportResponse> {
  const { accessToken } = await accessTokenFor(ctx);
  const meta = await ctx.google.getFile(accessToken, fileId);
  if (!meta || meta.trashed) {
    throw new InvalidFileError(
      'Não achei este arquivo no seu Drive. Escolha o projeto de novo.',
      404,
    );
  }
  if (meta.size !== undefined && meta.size > MAX_TRAMA_FILE_BYTES) {
    throw new InvalidFileError('Este arquivo é grande demais para ser um projeto do Trama.', 413);
  }
  const text = await ctx.google.downloadText(accessToken, fileId);
  if (text === null) {
    throw new InvalidFileError(
      'Não achei este arquivo no seu Drive. Escolha o projeto de novo.',
      404,
    );
  }
  if (new TextEncoder().encode(text).length > MAX_TRAMA_FILE_BYTES) {
    throw new InvalidFileError('Este arquivo é grande demais para ser um projeto do Trama.', 413);
  }
  const parsed = parseTramaFile(text);
  if (!parsed.ok) throw new InvalidFileError(parsed.error, 422);
  const { project, content } = parsed.file;

  const existing = await ctx.projects.get(project.id);
  if (existing) {
    // Abrir é uma escolha da pessoa: o arquivo vence. Para o conteúdo atual ir para o histórico
    // ("a anterior fica no histórico"), a gravação diz que se baseou numa revisão que não é a
    // de agora: o banco trata como conflito e guarda o que estava lá.
    const saved = await ctx.projects.save(existing.id, {
      content,
      title: project.title,
      baseRevision: existing.revision + 1,
    });
    if (saved) {
      await ctx.projects.setDriveFileId(existing.id, fileId);
      return { projectId: existing.id, created: false, replacedPrevious: saved.overwrote };
    }
  }
  const created = await ctx.projects.create({ kind: 'flow', title: project.title, content });
  await ctx.projects.setDriveFileId(created.id, fileId);
  return { projectId: created.id, created: true, replacedPrevious: false };
}

/** Frase para a pessoa, e para o `last_error`, a partir do erro do Google. */
export function describeGoogleError(error: unknown): string {
  if (error instanceof GoogleError && error.kind === 'auth') {
    return 'O Google recusou o acesso ao seu Drive. Conecte o Drive de novo.';
  }
  return 'Não deu para copiar para o Drive agora. O Trama tenta de novo sozinho.';
}

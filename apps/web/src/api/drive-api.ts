import {
  driveConnectResponseSchema,
  driveCopyResponseSchema,
  driveImportResponseSchema,
  drivePickerTokenSchema,
  driveStatusSchema,
  type DriveCopyResponse,
  type DriveImportResponse,
  type DrivePickerToken,
  type DriveStatus,
} from '@trama/core';
import { z } from 'zod';
import { createCaller } from './http';

/** O que as telas usam da API do Google Drive (apps/api, rotas `/drive`). */
export interface DriveApi {
  status(): Promise<DriveStatus>;
  /** Pede o endereço da tela de consentimento do Google; `returnTo` é o caminho de volta. */
  startConnect(returnTo?: string): Promise<{ url: string }>;
  /** Entrega o bilhete que o retorno do Google trouxe; a API grava a conexão. */
  finishConnect(ticket: string): Promise<DriveStatus>;
  disconnect(): Promise<void>;
  copyProject(id: string, options?: { keepalive?: boolean }): Promise<DriveCopyResponse>;
  pickerToken(): Promise<DrivePickerToken>;
  importFile(fileId: string): Promise<DriveImportResponse>;
}

interface Config {
  baseUrl: string;
  getToken: () => Promise<string | null>;
  fetch?: typeof fetch;
}

export function createDriveApi(config: Config): DriveApi {
  const call = createCaller(config);
  const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });
  return {
    status: () => call('/drive/status', driveStatusSchema),
    startConnect: (returnTo) =>
      call('/drive/connect', driveConnectResponseSchema, post(returnTo ? { returnTo } : {})),
    finishConnect: (ticket) => call('/drive/connection', driveStatusSchema, post({ ticket })),
    disconnect: () => call('/drive', z.undefined(), { method: 'DELETE' }),
    copyProject: (id, options) =>
      call(`/drive/projects/${encodeURIComponent(id)}/copy`, driveCopyResponseSchema, {
        method: 'POST',
        // Ao fechar a aba, o navegador termina o pedido mesmo depois de a página sair.
        ...(options?.keepalive ? { keepalive: true } : {}),
      }),
    pickerToken: () => call('/drive/picker-token', drivePickerTokenSchema, { method: 'POST' }),
    importFile: (fileId) => call('/drive/import', driveImportResponseSchema, post({ fileId })),
  };
}

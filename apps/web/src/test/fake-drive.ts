import type { DriveStatus } from '@trama/core';
import { vi } from 'vitest';
import { ApiError, type ProjectsApi } from '../api/projects-api';
import type { AccountApi } from '../api/account-api';
import type { DriveApi } from '../api/drive-api';
import { createFakeAccount as createFakeProfileAccount } from './fake-account';

export const disconnectedStatus: DriveStatus = {
  available: true,
  connected: false,
  email: null,
  folderUrl: null,
  lastCopyAt: null,
  consecutiveFailures: 0,
  lastError: null,
};

export const connectedStatus: DriveStatus = {
  ...disconnectedStatus,
  connected: true,
  email: 'ana@gmail.example',
  folderUrl: 'https://drive.google.com/drive/folders/pasta123',
  lastCopyAt: '2026-11-27T11:00:00.000Z',
};

/** API do Google Drive em memória para os testes das telas. */
export function createFakeDrive(initial: DriveStatus = disconnectedStatus) {
  let status = initial;
  const copies: string[] = [];
  let failCopies = 0;
  let projects: ProjectsApi | null = null;

  const api = {
    status: vi.fn(() => Promise.resolve(status)),
    startConnect: vi.fn((returnTo?: string) =>
      Promise.resolve({ url: `https://accounts.google.test/auth?volta=${returnTo ?? ''}` }),
    ),
    finishConnect: vi.fn(() => {
      status = connectedStatus;
      return Promise.resolve(status);
    }),
    disconnect: vi.fn(() => {
      status = disconnectedStatus;
      return Promise.resolve();
    }),
    copyProject: vi.fn((id: string) => {
      if (failCopies > 0) {
        failCopies -= 1;
        return Promise.reject(new ApiError('Não deu para copiar para o Drive agora.', 502));
      }
      copies.push(id);
      return Promise.resolve({
        driveFileId: 'arquivo-no-drive',
        copiedAt: `2026-11-27T12:00:${String(copies.length).padStart(2, '0')}.000Z`,
      });
    }),
    pickerToken: vi.fn(() => Promise.resolve({ accessToken: 'token-do-picker', expiresIn: 3599 })),
    importFile: vi.fn<DriveApi['importFile']>(() =>
      Promise.reject(new ApiError('Este arquivo não é um projeto do Trama.', 422)),
    ),
  } satisfies DriveApi;

  return {
    api,
    copies,
    setStatus(next: DriveStatus) {
      status = next;
    },
    failNextCopies(count: number) {
      failCopies = count;
    },
    /** Para o teste de "Abrir do Drive": o arquivo vira este projeto. */
    importAs(projectId: string) {
      api.importFile.mockImplementation(() =>
        Promise.resolve({ projectId, created: true, replacedPrevious: false }),
      );
    },
    useProjects(value: ProjectsApi) {
      projects = value;
    },
    get projects() {
      return projects;
    },
  };
}

/** Conta de mentira: guarda quantas vezes pediram as boas-vindas. */
export function createFakeAccount(options: { fail?: boolean } = {}) {
  const sendWelcome = vi.fn(() =>
    options.fail ? Promise.reject(new ApiError('boom', 502)) : Promise.resolve(),
  );
  const api: AccountApi = { ...createFakeProfileAccount().api, sendWelcome };
  return { api, sendWelcome };
}

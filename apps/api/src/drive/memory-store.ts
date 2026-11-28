import type { DriveConnection, DriveStore, WelcomeStore } from './store';

/**
 * Conexão do Drive em memória, com as mesmas regras do banco (`drive_record_copy`): sucesso
 * zera as falhas seguidas, falha soma 1. Só para testes.
 */
export function createMemoryDriveStore(
  clock: () => Date = () => new Date(),
): DriveStore & { connection: DriveConnection | null } {
  const store: DriveStore & { connection: DriveConnection | null } = {
    connection: null,
    get: () => Promise.resolve(store.connection),
    connect({ email, refreshTokenEncrypted }) {
      store.connection = {
        email,
        refreshTokenEncrypted,
        rootFolderId: store.connection?.rootFolderId ?? null,
        consecutiveFailures: 0,
        lastCopyAt: store.connection?.lastCopyAt ?? null,
        lastError: null,
      };
      return Promise.resolve();
    },
    setRootFolder(folderId) {
      if (store.connection) store.connection.rootFolderId = folderId;
      return Promise.resolve();
    },
    recordCopy(ok, error) {
      const connection = store.connection;
      if (!connection) return Promise.resolve({ consecutiveFailures: 0 });
      connection.consecutiveFailures = ok ? 0 : connection.consecutiveFailures + 1;
      connection.lastError = ok ? null : (error ?? null);
      if (ok) connection.lastCopyAt = clock().toISOString();
      return Promise.resolve({ consecutiveFailures: connection.consecutiveFailures });
    },
    disconnect() {
      store.connection = null;
      return Promise.resolve();
    },
  };
  return store;
}

/** Reserva das boas-vindas em memória: uma vez por instância (uma pessoa). Só para testes. */
export function createMemoryWelcomeStore(): WelcomeStore & { sent: boolean } {
  const store = {
    sent: false,
    claim() {
      if (store.sent) return Promise.resolve(false);
      store.sent = true;
      return Promise.resolve(true);
    },
    release() {
      store.sent = false;
      return Promise.resolve();
    },
  };
  return store;
}

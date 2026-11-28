import type { DriveConnection, DriveStore, WelcomeStore } from './store';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Conexão do Drive em memória, com as mesmas regras do banco (`drive_record_copy`): sucesso
 * zera as falhas seguidas, falha soma 1. Só para testes.
 */
export function createMemoryDriveStore(
  clock: () => Date = () => new Date(),
): DriveStore & { connection: DriveConnection | null; noticeSentAt: Date | null } {
  const store: DriveStore & { connection: DriveConnection | null; noticeSentAt: Date | null } = {
    connection: null,
    // Como em `profiles.drive_notice_sent_at`: sobrevive a desconectar e conectar de novo.
    noticeSentAt: null,
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
    claimNotice() {
      const now = clock();
      const failing = (store.connection?.consecutiveFailures ?? 0) >= 3;
      const recent =
        store.noticeSentAt !== null && now.getTime() - store.noticeSentAt.getTime() < DAY_MS;
      if (!failing || recent) return Promise.resolve(false);
      store.noticeSentAt = now;
      return Promise.resolve(true);
    },
    disconnect() {
      store.connection = null;
      return Promise.resolve();
    },
  };
  return store;
}

/** Reserva das boas-vindas em memória: uma vez por instância (uma pessoa). Só para testes. */
export function createMemoryWelcomeStore(): WelcomeStore & { sent: boolean; attempts: number } {
  const store = {
    sent: false,
    attempts: 0,
    claim() {
      // Como `claim_welcome_email`: uma vez, e no máximo 3 reservas mesmo devolvidas.
      if (store.sent || store.attempts >= 3) return Promise.resolve(false);
      store.sent = true;
      store.attempts += 1;
      return Promise.resolve(true);
    },
    release() {
      store.sent = false;
      return Promise.resolve();
    },
  };
  return store;
}

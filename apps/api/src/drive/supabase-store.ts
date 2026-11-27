import { check, createUserClient, iso } from '../supabase';
import type { DriveConnection, DriveStore, WelcomeStore } from './store';

interface ConnectionRow {
  google_email: string | null;
  refresh_token_encrypted: string;
  root_folder_id: string | null;
  consecutive_failures: number;
  last_copy_at: string | null;
  last_error: string | null;
}

const COLUMNS =
  'google_email, refresh_token_encrypted, root_folder_id, consecutive_failures, last_copy_at, last_error';

/** A conexão com o Drive no Supabase, com o token da pessoa: a RLS só deixa a linha dela. */
export function createSupabaseDriveStore(
  url: string,
  publishableKey: string,
  token: string,
): DriveStore {
  const supabase = createUserClient(url, publishableKey, token);

  return {
    async get() {
      const { data, error, status } = await supabase
        .from('drive_connections')
        .select(COLUMNS)
        .returns<ConnectionRow[]>()
        .maybeSingle();
      check(error, status);
      if (!data) return null;
      const connection: DriveConnection = {
        email: data.google_email,
        refreshTokenEncrypted: data.refresh_token_encrypted,
        rootFolderId: data.root_folder_id,
        consecutiveFailures: data.consecutive_failures,
        lastCopyAt: data.last_copy_at ? iso(data.last_copy_at) : null,
        lastError: data.last_error,
      };
      return connection;
    },

    async connect({ email, refreshTokenEncrypted }) {
      // owner_id vem de auth.uid() (padrão da coluna); no conflito, a linha da pessoa é atualizada.
      const { error, status } = await supabase.from('drive_connections').upsert(
        {
          google_email: email,
          refresh_token_encrypted: refreshTokenEncrypted,
          consecutive_failures: 0,
          last_error: null,
        },
        { onConflict: 'owner_id' },
      );
      check(error, status);
    },

    async setRootFolder(folderId) {
      // A RLS já limita à linha da pessoa; o filtro só existe porque o PostgREST exige um.
      const { error, status } = await supabase
        .from('drive_connections')
        .update({ root_folder_id: folderId })
        .not('owner_id', 'is', null);
      check(error, status);
    },

    async recordCopy(ok, errorText) {
      const result = await supabase.rpc('drive_record_copy', {
        p_ok: ok,
        ...(errorText ? { p_error: errorText } : {}),
      });
      check(result.error, result.status);
      const data: unknown = result.data;
      const row: unknown = Array.isArray(data) ? data[0] : data;
      const failures = (row as { consecutive_failures?: unknown } | null)?.consecutive_failures;
      return { consecutiveFailures: typeof failures === 'number' ? failures : 0 };
    },

    async disconnect() {
      const { error, status } = await supabase
        .from('drive_connections')
        .delete()
        .not('owner_id', 'is', null);
      check(error, status);
    },
  };
}

/** A reserva do e-mail de boas-vindas, pelas funções do banco (migration boas_vindas). */
export function createSupabaseWelcomeStore(
  url: string,
  publishableKey: string,
  token: string,
): WelcomeStore {
  const supabase = createUserClient(url, publishableKey, token);
  return {
    async claim() {
      const { data, error, status } = await supabase.rpc('claim_welcome_email');
      check(error, status);
      return data === true;
    },
    async release() {
      const { error, status } = await supabase.rpc('release_welcome_email');
      check(error, status);
    },
  };
}

import { createClient } from '@supabase/supabase-js';
import { applyProfileUpdate, emailPreferencesSchema, type Profile } from '@trama/core';
import { SessionError } from '../projects/store';
import type { AccountStore } from './store';

interface ProfileRow {
  name: string;
  timezone: string;
  email_preferences: unknown;
}

const COLUMNS = 'name, timezone, email_preferences';

function toProfile(row: ProfileRow): Profile {
  return {
    name: row.name,
    timezone: row.timezone,
    // O banco pode não ter uma das chaves: o esquema completa com o padrão.
    emailPreferences: emailPreferencesSchema.parse(row.email_preferences ?? {}),
  };
}

/**
 * O id da pessoa, lido do token (campo `sub`). Não confere a assinatura de propósito: quem a
 * confere é o banco, a cada pedido; um token falso só leva a um erro 401 de lá.
 */
export function userIdFromToken(token: string): string {
  try {
    const payload = token.split('.')[1] ?? '';
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))) as {
      sub?: unknown;
    };
    if (typeof json.sub === 'string' && json.sub) return json.sub;
  } catch {
    // cai no erro abaixo
  }
  throw new SessionError();
}

/** Token vencido ou falso vira SessionError (401); o resto é erro. */
function check(error: { code?: string; message: string } | null, status?: number): void {
  if (!error) return;
  if (status === 401 || error.code === 'PGRST301' || error.code === 'PGRST303') {
    throw new SessionError();
  }
  throw new Error(`Supabase: ${error.code ?? ''} ${error.message}`);
}

/** Perfil no Supabase, com a chave publicável e o token da pessoa (a RLS vale). */
export function createSupabaseAccountStore(
  url: string,
  publishableKey: string,
  token: string,
): AccountStore {
  const supabase = createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  async function read(id: string): Promise<Profile | null> {
    const { data, error, status } = await supabase
      .from('profiles')
      .select(COLUMNS)
      .eq('id', id)
      .returns<ProfileRow[]>()
      .maybeSingle();
    check(error, status);
    return data ? toProfile(data) : null;
  }

  return {
    getProfile: () => read(userIdFromToken(token)),

    async updateProfile(patch) {
      const id = userIdFromToken(token);
      const current = await read(id);
      if (!current) return null;
      const next = applyProfileUpdate(current, patch);
      const { data, error, status } = await supabase
        .from('profiles')
        .update({
          name: next.name,
          timezone: next.timezone,
          email_preferences: next.emailPreferences,
        })
        .eq('id', id)
        .select(COLUMNS)
        .returns<ProfileRow[]>();
      check(error, status);
      const row = data?.[0];
      return row ? toProfile(row) : null;
    },
  };
}

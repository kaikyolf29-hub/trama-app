import { createSupabaseAuthClient } from './auth/supabase-client';
import type { AuthClient } from './auth/types';
import { createUnconfiguredAuthClient } from './auth/unconfigured-client';

/** Cria o cliente de login a partir do apps/web/.env (veja o .env.example na raiz). */
export function createAuthClientFromEnv(): AuthClient {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const appUrl = (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, '');
  if (!url || !key) return createUnconfiguredAuthClient();
  return createSupabaseAuthClient(url, key, appUrl);
}

import { createSupabaseAuthClient } from './auth/supabase-client';
import type { AuthClient } from './auth/types';
import { createUnconfiguredAuthClient } from './auth/unconfigured-client';
import { createSupabase, type Supabase } from './supabase';

export interface Backend {
  auth: AuthClient;
  /** null quando o apps/web/.env não tem o Supabase (o site abre, mas sem login). */
  supabase: Supabase | null;
}

/** Cria o login (e o acesso aos arquivos) a partir do apps/web/.env (veja o .env.example). */
export function createBackendFromEnv(): Backend {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const appUrl = (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, '');
  if (!url || !key) return { auth: createUnconfiguredAuthClient(), supabase: null };
  const supabase = createSupabase(url, key);
  return { auth: createSupabaseAuthClient(supabase, appUrl), supabase };
}

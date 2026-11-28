import { createClient } from '@supabase/supabase-js';
import { SessionError } from './projects/store';

/** Cliente do Supabase com a chave publicável e o token da pessoa: o banco aplica a RLS. */
export function createUserClient(url: string, publishableKey: string, token: string) {
  return createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

interface PostgrestError {
  code?: string;
  message: string;
}

/** Token vencido ou falso vira SessionError (401); o resto que falhou é erro de verdade. */
export function check(error: PostgrestError | null, status?: number): void {
  if (!error) return;
  if (status === 401 || error.code === 'PGRST301' || error.code === 'PGRST303') {
    throw new SessionError();
  }
  throw new Error(`Supabase: ${error.code ?? ''} ${error.message}`);
}

/** O Postgres manda microssegundos e "+00:00"; a API devolve ISO em UTC. */
export function iso(value: string): string {
  return new Date(value).toISOString();
}

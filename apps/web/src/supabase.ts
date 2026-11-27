import { createClient } from '@supabase/supabase-js';

/**
 * O cliente do Supabase do site: um só, para o login e para os arquivos usarem a mesma
 * sessão. Só leva a chave publicável; o que cada pessoa pode ler e gravar é a RLS que decide.
 */
export function createSupabase(url: string, publishableKey: string) {
  return createClient(url, publishableKey, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

/** O cliente do Supabase como o site o cria (sem tipos gerados do banco, por enquanto). */
export type Supabase = ReturnType<typeof createSupabase>;

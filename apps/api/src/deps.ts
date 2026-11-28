import { createSupabaseIdentity, type IdentityResolver } from './account/identity';
import { createSupabaseDriveStore, createSupabaseWelcomeStore } from './drive/supabase-store';
import { createGoogle, type Google } from './drive/google';
import type { DriveStore, WelcomeStore } from './drive/store';
import { createVault, type Vault } from './drive/vault';
import type { Env } from './env';
import { createResendMailer, type Mailer } from './mail';
import { createSupabaseStore } from './projects/supabase-store';
import type { ProjectStore } from './projects/store';

/**
 * Tudo o que as rotas usam de fora do Worker: banco, Google, e-mail e relógio. Em produção vem
 * de `defaultDeps`; os testes trocam por versões falsas (memória e `fetch` falso).
 */
export interface Deps {
  projects(env: Env, token: string): ProjectStore;
  drive(env: Env, token: string): DriveStore;
  welcome(env: Env, token: string): WelcomeStore;
  identity(env: Env): IdentityResolver;
  /** null quando faltam GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET. */
  google(env: Env): Google | null;
  /** null quando falta a TOKEN_ENCRYPTION_KEY. */
  vault(env: Env): Promise<Vault | null>;
  mailer(env: Env): Mailer;
  now(): Date;
}

function supabaseOf(env: Env): { url: string; key: string } {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('Faltam SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY no Worker.');
  }
  return { url: env.SUPABASE_URL, key: env.SUPABASE_PUBLISHABLE_KEY };
}

const vaults = new Map<string, Promise<Vault>>();

export function defaultDeps(fetcher: typeof fetch = (...args) => fetch(...args)): Deps {
  return {
    projects(env, token) {
      const { url, key } = supabaseOf(env);
      return createSupabaseStore(url, key, token);
    },
    drive(env, token) {
      const { url, key } = supabaseOf(env);
      return createSupabaseDriveStore(url, key, token);
    },
    welcome(env, token) {
      const { url, key } = supabaseOf(env);
      return createSupabaseWelcomeStore(url, key, token);
    },
    identity(env) {
      const { url, key } = supabaseOf(env);
      return createSupabaseIdentity(url, key, fetcher);
    },
    google(env) {
      if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
      return createGoogle(
        { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
        fetcher,
      );
    },
    vault(env) {
      const key = env.TOKEN_ENCRYPTION_KEY;
      if (!key) return Promise.resolve(null);
      let vault = vaults.get(key);
      if (!vault) {
        vault = createVault(key);
        vaults.set(key, vault);
      }
      return vault;
    },
    mailer: (env) => createResendMailer(env, fetcher),
    now: () => new Date(),
  };
}

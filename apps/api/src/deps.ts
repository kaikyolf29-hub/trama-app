import { createProvider, type AiProvider } from '@trama/ai';
import type { AiProvider as AiProviderId } from '@trama/core';
import type { AiStore } from './ai/store';
import { createSupabaseAiStore } from './ai/supabase-store';
import { createSupabaseIdentity, type IdentityResolver } from './account/identity';
import type { AccountStore } from './account/store';
import { createSupabaseAccountStore } from './account/supabase-store';
import { createSupabaseDriveStore, createSupabaseWelcomeStore } from './drive/supabase-store';
import { createGoogle, type Google } from './drive/google';
import type { DriveStore, WelcomeStore } from './drive/store';
import { createVault, type Vault } from './drive/vault';
import type { Env } from './env';
import type { OrganizationStore } from './organization/store';
import { createSupabaseOrganizationStore } from './organization/supabase-store';
import { createSupabaseDigestStore } from './digest/supabase-store';
import type { DigestStore } from './digest/store';
import { createResendMailer, type Mailer } from './mail';
import { createSupabaseStore } from './projects/supabase-store';
import type { ProjectStore } from './projects/store';

/**
 * Tudo o que as rotas usam de fora do Worker: banco, Google, e-mail e relógio. Em produção vem
 * de `defaultDeps`; os testes trocam por versões falsas (memória e `fetch` falso).
 */
export interface Deps {
  projects(env: Env, token: string): ProjectStore;
  /** O perfil da pessoa (etapa 2.5). */
  account(env: Env, token: string): AccountStore;
  /** Eventos da Agenda e aulas dos cadernos. */
  organization(env: Env, token: string): OrganizationStore;
  drive(env: Env, token: string): DriveStore;
  welcome(env: Env, token: string): WelcomeStore;
  /** As chaves cifradas e as preferências de IA da pessoa (etapa 3.1). */
  ai(env: Env, token: string): AiStore;
  /** O provedor de IA com a chave (já decifrada) da pessoa; um cliente novo por pedido. */
  aiProvider(provider: AiProviderId, apiKey: string): AiProvider;
  identity(env: Env): IdentityResolver;
  /** null quando faltam GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET. */
  google(env: Env): Google | null;
  /** null quando falta a TOKEN_ENCRYPTION_KEY. */
  vault(env: Env): Promise<Vault | null>;
  mailer(env: Env): Mailer;
  /**
   * O que a tarefa agendada de e-mails e o descadastro usam, com a chave secreta do Supabase
   * (sem token de pessoa). null quando falta a SUPABASE_SECRET_KEY.
   */
  digest(env: Env): DigestStore | null;
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
    account(env, token) {
      const { url, key } = supabaseOf(env);
      return createSupabaseAccountStore(url, key, token);
    },
    organization(env, token) {
      const { url, key } = supabaseOf(env);
      return createSupabaseOrganizationStore(url, key, token);
    },
    drive(env, token) {
      const { url, key } = supabaseOf(env);
      return createSupabaseDriveStore(url, key, token);
    },
    welcome(env, token) {
      const { url, key } = supabaseOf(env);
      return createSupabaseWelcomeStore(url, key, token);
    },
    ai(env, token) {
      const { url, key } = supabaseOf(env);
      return createSupabaseAiStore(url, key, token);
    },
    aiProvider: (provider, apiKey) => createProvider(provider, apiKey, { fetch: fetcher }),
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
    digest(env) {
      if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) return null;
      return createSupabaseDigestStore(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);
    },
    now: () => new Date(),
  };
}

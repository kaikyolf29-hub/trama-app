import type { Env } from './env';
import { apiTransport, createTramaApi, type TramaApi } from './trama-api';

/**
 * Tudo o que o Worker usa de fora: a rede (Supabase), a API do Trama e o relógio. Em produção
 * vem de `defaultDeps`; os testes trocam por versões falsas.
 */
export interface Deps {
  /** Chamadas ao Supabase Auth (e à API, quando não há service binding). */
  fetch: typeof fetch;
  /** A API do Trama com o token da pessoa. */
  api(env: Env, token: string): TramaApi;
  now(): Date;
}

export function defaultDeps(fetcher: typeof fetch = (...args) => fetch(...args)): Deps {
  return {
    fetch: fetcher,
    api(env, token) {
      const { send, base } = apiTransport(env, fetcher);
      return createTramaApi(send, base, token);
    },
    now: () => new Date(),
  };
}

import type { Env } from './env';

const LOCAL_ORIGINS = new Set(['http://localhost:5173', 'http://127.0.0.1:5173']);

/** Só o site do Trama (produção e previews dos PRs) e o `pnpm dev` chamam as rotas do site. */
export function isAllowedOrigin(
  origin: string,
  env: Pick<Env, 'APP_URL' | 'WORKERS_SUBDOMAIN'>,
): boolean {
  if (LOCAL_ORIGINS.has(origin)) return true;
  if (env.APP_URL && origin === new URL(env.APP_URL).origin) return true;
  const sub = env.WORKERS_SUBDOMAIN;
  if (!sub || !/^[a-z0-9-]+$/.test(sub)) return false;
  return new RegExp(`^https://(?:pr-\\d+-)?trama\\.${sub}\\.workers\\.dev$`).test(origin);
}

/** O site, sem barra no fim (o `/authorize` leva a pessoa até ele). */
export function appBase(env: Pick<Env, 'APP_URL'>): string {
  return (env.APP_URL ?? 'http://localhost:5173').replace(/\/+$/, '');
}

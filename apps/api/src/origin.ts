import type { Env } from './env';

const LOCAL_ORIGINS = new Set(['http://localhost:5173', 'http://127.0.0.1:5173']);

/** Só o site do Trama (produção e previews dos PRs) e o `pnpm dev` chamam a API. */
export function isAllowedOrigin(origin: string, env: Env): boolean {
  if (LOCAL_ORIGINS.has(origin)) return true;
  if (env.APP_URL && origin === new URL(env.APP_URL).origin) return true;
  const sub = env.WORKERS_SUBDOMAIN;
  if (!sub || !/^[a-z0-9-]+$/.test(sub)) return false;
  return new RegExp(`^https://(?:pr-\\d+-)?trama\\.${sub}\\.workers\\.dev$`).test(origin);
}

/**
 * O site que fez o pedido, para o retorno do Google voltar para o lugar certo (produção, preview
 * de um PR ou `pnpm dev`). Só vale uma origem que o CORS já aceita; senão, o APP_URL.
 */
export function appOrigin(origin: string | undefined, env: Env): string | null {
  if (origin && isAllowedOrigin(origin, env)) return origin;
  return env.APP_URL ? new URL(env.APP_URL).origin : null;
}

/** Caminho do site (começa com uma barra só); qualquer outra coisa vira "/". */
export function safePath(path: string | undefined): string {
  if (!path || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return '/';
  // Um caminho com esquema escondido ("/\t/evil") também não passa.
  return /\p{Cc}/u.test(path) ? '/' : path;
}

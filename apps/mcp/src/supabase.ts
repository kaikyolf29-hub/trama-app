import type { Env } from './env';

/** O Supabase Auth recusou o token: venceu, foi revogado ou é falso. A sessão acabou de vez. */
export class SessionEndedError extends Error {
  constructor() {
    super('sessão encerrada');
    this.name = 'SessionEndedError';
  }
}

/** O Supabase Auth não respondeu direito (fora do ar, limite de pedidos): tentar de novo depois. */
export class SupabaseUnavailableError extends Error {
  constructor(status: number) {
    super(`Supabase Auth respondeu ${String(status)}`);
    this.name = 'SupabaseUnavailableError';
  }
}

function authUrl(env: Env, path: string): { url: string; key: string } {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('Faltam SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY no Worker.');
  }
  return {
    url: `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1${path}`,
    key: env.SUPABASE_PUBLISHABLE_KEY,
  };
}

/**
 * Quem é a pessoa do token de acesso, como o Supabase Auth confirma (só ele confere a assinatura
 * do JWT). Token falso ou vencido vira `SessionEndedError`.
 */
export async function getUserId(
  env: Env,
  accessToken: string,
  fetcher: typeof fetch,
): Promise<string> {
  const { url, key } = authUrl(env, '/user');
  const response = await fetcher(url, {
    headers: { apikey: key, Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 401 || response.status === 403) throw new SessionEndedError();
  if (!response.ok) throw new SupabaseUnavailableError(response.status);
  const user = await response.json<{ id?: unknown }>();
  if (typeof user.id !== 'string' || user.id === '' || user.id.includes(':')) {
    throw new SessionEndedError();
  }
  return user.id;
}

export interface RefreshedSession {
  accessToken: string;
  /** O Supabase troca o refresh token a cada uso: este é o novo, e o antigo deixa de valer. */
  refreshToken: string;
  /** Quantos segundos o token de acesso ainda vale. */
  expiresIn: number;
}

/**
 * Renova a sessão com o refresh token. Quando o Supabase diz que o token não vale mais (revogado,
 * já usado, sessão encerrada), é `SessionEndedError`: o conector perde o acesso de vez. Qualquer
 * outro problema é `SupabaseUnavailableError`, e a concessão fica para a próxima tentativa.
 */
export async function refreshSession(
  env: Env,
  refreshToken: string,
  fetcher: typeof fetch,
): Promise<RefreshedSession> {
  const { url, key } = authUrl(env, '/token?grant_type=refresh_token');
  const response = await fetcher(url, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    throw new SessionEndedError();
  }
  if (!response.ok) throw new SupabaseUnavailableError(response.status);
  const data = await response.json<{
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
  }>();
  if (
    typeof data.access_token !== 'string' ||
    typeof data.refresh_token !== 'string' ||
    typeof data.expires_in !== 'number'
  ) {
    throw new SupabaseUnavailableError(502);
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

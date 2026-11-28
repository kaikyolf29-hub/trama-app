import type { Env } from './env';

/** A chave do "último uso" de uma concessão. Fica fora do prefixo `grant:` da biblioteca. */
export function lastUsedKey(userId: string, grantId: string): string {
  return `trama:used:${userId}:${grantId}`;
}

/**
 * Só grava o último uso se o anterior tem mais de 10 minutos. O KV do plano grátis aceita 1.000
 * gravações por dia, e cada chamada de ferramenta não pode gastar uma. Leitura é folgada (100 mil).
 */
export const LAST_USED_INTERVAL_MS = 10 * 60 * 1000;

/** Os dados somem 40 dias depois do último uso (a concessão dura 30 dias sem uso). */
const LAST_USED_TTL_SECONDS = 40 * 24 * 60 * 60;

export async function touchLastUsed(
  env: Pick<Env, 'OAUTH_KV'>,
  userId: string,
  grantId: string,
  now: Date,
): Promise<void> {
  const key = lastUsedKey(userId, grantId);
  const previous = await env.OAUTH_KV.get(key);
  if (previous && now.getTime() - new Date(previous).getTime() < LAST_USED_INTERVAL_MS) return;
  await env.OAUTH_KV.put(key, now.toISOString(), { expirationTtl: LAST_USED_TTL_SECONDS });
}

import { SessionError } from '../projects/store';

/** Quem é a pessoa do token de login, como o Supabase Auth confirma. */
export interface Identity {
  id: string;
  email: string;
  name: string;
}

/** Confere o token no Supabase Auth e devolve quem é. Token falso ou vencido vira SessionError. */
export type IdentityResolver = (token: string) => Promise<Identity>;

/**
 * Pergunta ao Supabase Auth (`GET /auth/v1/user`) em vez de ler o JWT à mão: só o Supabase
 * confere a assinatura. Serve para ligar o `state` do OAuth à pessoa e para achar o e-mail dela.
 */
export function createSupabaseIdentity(
  url: string,
  publishableKey: string,
  fetcher: typeof fetch = (...args) => fetch(...args),
): IdentityResolver {
  return async (token) => {
    const response = await fetcher(`${url.replace(/\/$/, '')}/auth/v1/user`, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${token}` },
    });
    if (response.status === 401 || response.status === 403) throw new SessionError();
    if (!response.ok) throw new Error(`Supabase Auth respondeu ${String(response.status)}`);
    const user = (await response.json()) as {
      id?: unknown;
      email?: unknown;
      user_metadata?: { name?: unknown } | null;
    };
    if (typeof user.id !== 'string') throw new SessionError();
    const name = user.user_metadata?.name;
    return {
      id: user.id,
      email: typeof user.email === 'string' ? user.email : '',
      name: typeof name === 'string' ? name : '',
    };
  };
}

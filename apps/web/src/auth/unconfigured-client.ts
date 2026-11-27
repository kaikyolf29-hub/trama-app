import type { AuthClient, AuthResult } from './types';

export const NOT_CONFIGURED =
  'O login ainda não está ligado neste ambiente. Preencha VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY em apps/web/.env.';

const notConfigured = <T>(): Promise<AuthResult<T>> =>
  Promise.resolve({ ok: false, error: NOT_CONFIGURED });

/** Usado quando o .env não tem o Supabase: as telas abrem e explicam o que falta. */
export function createUnconfiguredAuthClient(): AuthClient {
  return {
    getUser: () => Promise.resolve(null),
    getAccessToken: () => Promise.resolve(null),
    onUserChange: () => () => undefined,
    signUp: notConfigured,
    signIn: notConfigured,
    requestPasswordReset: notConfigured,
    verifyRecovery: notConfigured,
    updatePassword: notConfigured,
    signOut: () => Promise.resolve(),
  };
}

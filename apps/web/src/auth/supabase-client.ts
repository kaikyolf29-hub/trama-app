import type { User } from '@supabase/supabase-js';
import type { Supabase } from '../supabase';
import { authErrorMessage } from './errors';
import type { AuthClient, AuthResult, AuthUser } from './types';

function toUser(user: User): AuthUser {
  const name: unknown = user.user_metadata.name;
  return {
    id: user.id,
    email: user.email ?? '',
    name: typeof name === 'string' ? name : '',
  };
}

const ok: AuthResult = { ok: true, value: undefined };

/**
 * Login pelo Supabase Auth: e-mail e senha, com recuperação de senha.
 * A recuperação usa o `token_hash` do e-mail (supabase/templates/recovery.html), conferido
 * na tela /nova-senha. Assim o link funciona mesmo aberto em outro aparelho.
 */
export function createSupabaseAuthClient(supabase: Supabase, appUrl: string): AuthClient {
  const auth = supabase.auth;

  return {
    async getUser() {
      const { data } = await auth.getSession();
      return data.session ? toUser(data.session.user) : null;
    },

    async getAccessToken() {
      // getSession renova o token sozinho quando ele está perto de vencer.
      const { data } = await auth.getSession();
      return data.session?.access_token ?? null;
    },

    onUserChange(listener) {
      // Não chame o Supabase de dentro deste callback: ele roda sob uma trava interna.
      const { data } = auth.onAuthStateChange((_event, session) => {
        listener(session ? toUser(session.user) : null);
      });
      return () => data.subscription.unsubscribe();
    },

    async signUp({ name, email, password }) {
      const { data, error } = await auth.signUp({
        email,
        password,
        options: { data: { name }, emailRedirectTo: appUrl },
      });
      if (error) return { ok: false, error: authErrorMessage(error) };
      return { ok: true, value: { needsConfirmation: !data.session } };
    },

    async signIn({ email, password }) {
      const { error } = await auth.signInWithPassword({ email, password });
      return error ? { ok: false, error: authErrorMessage(error) } : ok;
    },

    async requestPasswordReset(email) {
      const { error } = await auth.resetPasswordForEmail(email, {
        redirectTo: `${appUrl}/nova-senha`,
      });
      return error ? { ok: false, error: authErrorMessage(error) } : ok;
    },

    async verifyRecovery(tokenHash) {
      const { error } = await auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
      return error ? { ok: false, error: authErrorMessage(error) } : ok;
    },

    async updatePassword(password) {
      const { error } = await auth.updateUser({ password });
      return error ? { ok: false, error: authErrorMessage(error) } : ok;
    },

    async signOut() {
      await auth.signOut();
    },
  };
}

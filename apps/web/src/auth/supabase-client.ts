import { createClient, type User } from '@supabase/supabase-js';
import type { Supabase } from '../supabase';
import { authErrorMessage, EMAIL_SEND_ERROR, isServerError, RECOVERY_SEND_ERROR } from './errors';
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
export function createSupabaseAuthClient(
  supabase: Supabase,
  appUrl: string,
  /** Endereço e chave publicável: só para abrir a sessão separada do conector. */
  config?: { url: string; publishableKey: string },
): AuthClient {
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
      if (!error) return ok;
      // 5xx aqui é o envio do e-mail que falhou (SMTP), não a conta nem a internet.
      return {
        ok: false,
        error: isServerError(error) ? RECOVERY_SEND_ERROR : authErrorMessage(error),
      };
    },

    async verifyRecovery(tokenHash) {
      const { error } = await auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
      return error ? { ok: false, error: authErrorMessage(error) } : ok;
    },

    async updatePassword(password) {
      const { error } = await auth.updateUser({ password });
      return error ? { ok: false, error: authErrorMessage(error) } : ok;
    },

    async updateName(name) {
      const { error } = await auth.updateUser({ data: { name } });
      return error ? { ok: false, error: authErrorMessage(error) } : ok;
    },

    async updateEmail(email) {
      const { error } = await auth.updateUser(
        { email },
        { emailRedirectTo: `${appUrl}/configuracoes` },
      );
      if (!error) return ok;
      const code = (error as { code?: unknown }).code;
      if (code === 'email_exists' || code === 'user_already_exists') {
        return { ok: false, error: 'Já existe uma conta com este e-mail. Use outro endereço.' };
      }
      return {
        ok: false,
        error: isServerError(error) ? EMAIL_SEND_ERROR : authErrorMessage(error),
      };
    },

    async verifyEmailChange(tokenHash) {
      const { error } = await auth.verifyOtp({ token_hash: tokenHash, type: 'email_change' });
      return error ? { ok: false, error: authErrorMessage(error) } : ok;
    },

    async openConnectorSession(password) {
      const { data: current } = await auth.getSession();
      const email = current.session?.user.email;
      if (!config || !email) return { ok: false, error: 'Entre de novo para continuar.' };
      // Um cliente à parte, que não guarda nada nem renova sozinho: a sessão é só do conector.
      const separate = createClient(config.url, config.publishableKey, {
        auth: {
          // Chave própria: nada se mistura com a sessão do site, e nada é guardado.
          storageKey: 'trama-conector',
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
      const { data, error } = await separate.auth.signInWithPassword({ email, password });
      if (error || !data.session) {
        return {
          ok: false,
          error: error ? authErrorMessage(error) : 'Não deu para confirmar a senha.',
        };
      }
      return {
        ok: true,
        value: {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
        },
      };
    },

    async signOut() {
      await auth.signOut();
    },
  };
}

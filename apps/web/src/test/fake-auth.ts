import type { AuthClient, AuthResult, AuthUser } from '../auth/types';

interface Account {
  user: AuthUser;
  password: string;
}

const ok: AuthResult = { ok: true, value: undefined };

/** Cliente de login em memória para os testes das telas. */
export function createFakeAuth(options: { requireConfirmation?: boolean } = {}) {
  const accounts = new Map<string, Account>();
  const listeners = new Set<(user: AuthUser | null) => void>();
  let current: AuthUser | null = null;
  const validTokens = new Map<string, string>();
  const calls = {
    verifyRecovery: [] as string[],
    requestPasswordReset: [] as string[],
    updateEmail: [] as string[],
    updateName: [] as string[],
    verifyEmailChange: [] as string[],
    openConnectorSession: [] as string[],
  };

  const setCurrent = (user: AuthUser | null) => {
    current = user;
    listeners.forEach((listener) => listener(user));
  };

  const client: AuthClient = {
    getUser: () => Promise.resolve(current),
    getAccessToken: () => Promise.resolve(current ? `token-${current.id}` : null),
    onUserChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    signUp({ name, email, password }) {
      if (accounts.has(email)) {
        return Promise.resolve({
          ok: false,
          error: 'Já existe uma conta com este e-mail. Entre ou recupere a senha.',
        });
      }
      const user = { id: `u${accounts.size + 1}`, email, name };
      accounts.set(email, { user, password });
      if (!options.requireConfirmation) setCurrent(user);
      return Promise.resolve({
        ok: true,
        value: { needsConfirmation: Boolean(options.requireConfirmation) },
      });
    },
    signIn({ email, password }) {
      const account = accounts.get(email);
      if (!account || account.password !== password) {
        return Promise.resolve({ ok: false, error: 'E-mail ou senha incorretos.' });
      }
      setCurrent(account.user);
      return Promise.resolve(ok);
    },
    requestPasswordReset(email) {
      calls.requestPasswordReset.push(email);
      return Promise.resolve(ok);
    },
    verifyRecovery(tokenHash) {
      calls.verifyRecovery.push(tokenHash);
      const email = validTokens.get(tokenHash);
      validTokens.delete(tokenHash);
      const account = email ? accounts.get(email) : undefined;
      if (!account) {
        return Promise.resolve({
          ok: false,
          error: 'Este link expirou ou já foi usado. Peça um link novo.',
        });
      }
      setCurrent(account.user);
      return Promise.resolve(ok);
    },
    updatePassword(password) {
      const account = current ? accounts.get(current.email) : undefined;
      if (!account)
        return Promise.resolve({ ok: false, error: 'Sua sessão terminou. Entre de novo.' });
      account.password = password;
      return Promise.resolve(ok);
    },
    updateName(name) {
      calls.updateName.push(name);
      if (!current)
        return Promise.resolve({ ok: false, error: 'Sua sessão terminou. Entre de novo.' });
      const account = accounts.get(current.email);
      if (account) account.user = { ...account.user, name };
      setCurrent({ ...current, name });
      return Promise.resolve(ok);
    },
    updateEmail(email) {
      calls.updateEmail.push(email);
      if (accounts.has(email)) {
        return Promise.resolve({
          ok: false,
          error: 'Já existe uma conta com este e-mail. Use outro endereço.',
        });
      }
      return Promise.resolve(ok);
    },
    verifyEmailChange(tokenHash) {
      calls.verifyEmailChange.push(tokenHash);
      return Promise.resolve(
        tokenHash === 'bom'
          ? ok
          : { ok: false, error: 'Este link expirou ou já foi usado. Peça um link novo.' },
      );
    },
    openConnectorSession(password) {
      calls.openConnectorSession.push(password);
      const account = current ? accounts.get(current.email) : undefined;
      if (!account || account.password !== password) {
        return Promise.resolve({ ok: false, error: 'E-mail ou senha incorretos.' });
      }
      return Promise.resolve({
        ok: true,
        value: { accessToken: 'acesso-do-conector', refreshToken: 'refresh-do-conector' },
      });
    },
    signOut() {
      setCurrent(null);
      return Promise.resolve();
    },
  };

  return {
    client,
    calls,
    addAccount(name: string, email: string, password: string) {
      accounts.set(email, { user: { id: `u${accounts.size + 1}`, email, name }, password });
    },
    signInAs(email: string) {
      current = accounts.get(email)?.user ?? null;
    },
    issueRecoveryToken(email: string, token: string) {
      validTokens.set(token, email);
    },
    passwordOf: (email: string) => accounts.get(email)?.password,
  };
}

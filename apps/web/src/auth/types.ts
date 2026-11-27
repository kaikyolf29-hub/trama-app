/** Quem está logado. O nome vem do cadastro (user_metadata.name no Supabase). */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

/** Resultado de uma ação de login; o erro já vem em português, pronto para a tela. */
export type AuthResult<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

export interface SignUpInput {
  name: string;
  email: string;
  password: string;
}

export interface SignInInput {
  email: string;
  password: string;
}

/**
 * Tudo o que as telas precisam do login. A implementação real usa o Supabase
 * (supabase-client.ts); os testes usam uma falsa.
 */
export interface AuthClient {
  /** A sessão guardada no navegador, se houver. */
  getUser(): Promise<AuthUser | null>;
  /** Avisa quando a pessoa entra, sai ou troca de conta. Devolve a função de parar. */
  onUserChange(listener: (user: AuthUser | null) => void): () => void;
  /** `needsConfirmation` é true quando o Supabase exige confirmar o e-mail antes de entrar. */
  signUp(input: SignUpInput): Promise<AuthResult<{ needsConfirmation: boolean }>>;
  signIn(input: SignInInput): Promise<AuthResult>;
  /** Pede o e-mail de recuperação. Não revela se o e-mail tem conta. */
  requestPasswordReset(email: string): Promise<AuthResult>;
  /** Confere o link do e-mail de recuperação e abre a sessão para trocar a senha. */
  verifyRecovery(tokenHash: string): Promise<AuthResult>;
  updatePassword(password: string): Promise<AuthResult>;
  signOut(): Promise<void>;
}

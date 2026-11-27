import { createContext, useContext } from 'react';
import type { AuthClient, AuthUser } from './types';

export type AuthStatus = 'loading' | 'signedIn' | 'signedOut';

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  client: AuthClient;
}

export const AuthContext = createContext<AuthState | null>(null);

/** Quem está logado e o cliente de login. Use dentro de <AuthProvider>. */
export function useAuth(): AuthState {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth precisa estar dentro de <AuthProvider>.');
  return auth;
}

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AuthContext, type AuthStatus } from './context';
import type { AuthClient, AuthUser } from './types';

/** Guarda quem está logado e acompanha as mudanças (entrar, sair, outra aba). */
export function AuthProvider({ client, children }: { client: AuthClient; children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    let alive = true;
    void client.getUser().then((current) => {
      if (!alive) return;
      setUser(current);
      setStatus(current ? 'signedIn' : 'signedOut');
    });
    const stop = client.onUserChange((next) => {
      setUser(next);
      setStatus(next ? 'signedIn' : 'signedOut');
    });
    return () => {
      alive = false;
      stop();
    };
  }, [client]);

  const value = useMemo(() => ({ status, user, client }), [status, user, client]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

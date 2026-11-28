import { useEffect } from 'react';
import { useServices } from '../services';
import { useAuth } from './context';

const flagKey = (userId: string) => `trama:welcome:${userId}`;

/**
 * Pede o e-mail de boas-vindas logo depois do cadastro. Quando o Supabase pede para confirmar
 * o e-mail antes, ainda não há sessão no cadastro; então o pedido sai no primeiro login. A API
 * só manda uma vez por pessoa (a reserva fica no banco), então repetir é inofensivo; o
 * `localStorage` só evita pedir a cada carga de página.
 */
export function WelcomeSender() {
  const { account } = useServices();
  const { user } = useAuth();
  const userId = user?.id;

  useEffect(() => {
    if (!account || !userId) return;
    try {
      if (localStorage.getItem(flagKey(userId))) return;
    } catch {
      // Sem armazenamento (janela anônima): a API garante o "uma vez" mesmo assim.
    }
    let alive = true;
    account.sendWelcome().then(
      () => {
        if (!alive) return;
        try {
          localStorage.setItem(flagKey(userId), '1');
        } catch {
          // Tudo bem: a API não manda de novo.
        }
      },
      () => undefined, // Falhou (rede, Resend): tenta de novo na próxima carga.
    );
    return () => {
      alive = false;
    };
  }, [account, userId]);

  return null;
}

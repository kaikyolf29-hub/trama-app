import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { Alert, Spinner } from '@trama/ui';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/context';
import { AuthLayout } from './AuthLayout';
import { textLinkClass } from './styles';

const route = getRouteApi('/confirmar-email');

type Stage = { kind: 'checking' } | { kind: 'invalid'; reason: string } | { kind: 'done' };

const NO_LINK = 'Para confirmar a troca de e-mail, abra o link que enviamos para o seu e-mail.';

/** Confere o link do e-mail de troca de endereço (`/confirmar-email?token_hash=…`). */
export function ConfirmEmailPage() {
  const { client } = useAuth();
  const navigate = useNavigate();
  const { token_hash: tokenHash } = route.useSearch();
  const [stage, setStage] = useState<Stage>(
    tokenHash ? { kind: 'checking' } : { kind: 'invalid', reason: NO_LINK },
  );
  const verified = useRef<string | null>(null);

  useEffect(() => {
    // O link só pode ser usado uma vez: confere uma vez só, mesmo no StrictMode.
    if (!tokenHash || verified.current === tokenHash) return;
    verified.current = tokenHash;
    void client.verifyEmailChange(tokenHash).then((response) => {
      setStage(response.ok ? { kind: 'done' } : { kind: 'invalid', reason: response.error });
      // Tira o código do endereço: recarregar a página não deve gastar o link de novo.
      void navigate({ to: '/confirmar-email', search: {}, replace: true });
    });
  }, [tokenHash, client, navigate]);

  if (stage.kind === 'checking') {
    return (
      <AuthLayout title="Confirmar e-mail">
        <p role="status" className="flex items-center gap-2.5 text-text-muted">
          <Spinner /> Conferindo o link…
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={stage.kind === 'done' ? 'Link confirmado' : 'Link inválido'}
      footer={
        <Link to="/configuracoes" className={textLinkClass}>
          Ir para as Configurações
        </Link>
      }
    >
      {stage.kind === 'done' ? (
        <Alert tone="success">
          Pronto. Se ainda não abriu o link do outro e-mail (o do endereço antigo e o do novo), abra
          também: a troca só vale depois dos dois.
        </Alert>
      ) : (
        <Alert tone="error">{stage.reason}</Alert>
      )}
    </AuthLayout>
  );
}

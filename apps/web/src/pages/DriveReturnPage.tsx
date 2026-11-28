import { useRouter, useRouterState, useSearch } from '@tanstack/react-router';
import { Alert, Spinner } from '@trama/ui';
import { useEffect, useRef, useState } from 'react';
import { safeReturnPath } from '../auth/return-path';
import { useServices } from '../services';
import { AuthLayout } from './AuthLayout';
import { textLinkClass } from './styles';

const DENIED = 'Você não deu acesso ao Google Drive. Quando quiser, conecte de novo.';
const FAILED = 'Não deu para conectar ao Google Drive. Tente de novo.';

/**
 * Para onde o Google devolve a pessoa depois do consentimento. A API manda um bilhete no
 * endereço (depois do `#`, que não vai para nenhum servidor); esta tela o entrega à API com o
 * login da pessoa, que grava a conexão, e volta para onde a pessoa estava.
 */
export function DriveReturnPage() {
  const { drive } = useServices();
  const router = useRouter();
  const search = useSearch({ from: '/drive/retorno' });
  const hash = useRouterState({ select: (state) => state.location.hash });
  const ticket = new URLSearchParams(hash.replace(/^#/, '')).get('t');
  const back = safeReturnPath(search.volta) ?? '/';
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const failure = search.erro === 'negado' ? DENIED : search.erro ? FAILED : null;

  useEffect(() => {
    if (failure || started.current) return;
    started.current = true;
    if (!drive || !ticket) {
      router.history.replace(back);
      return;
    }
    drive.finishConnect(ticket).then(
      () => router.history.replace(back),
      (cause: unknown) => {
        setError(cause instanceof Error ? cause.message : FAILED);
      },
    );
  }, [drive, ticket, failure, back, router]);

  const message = failure ?? error;
  return (
    <AuthLayout
      title={message ? 'Google Drive não conectado' : 'Conectando ao Google Drive…'}
      subtitle={message ? undefined : 'Só um instante.'}
    >
      {message ? (
        <div className="flex flex-col gap-4">
          <Alert tone="error">{message}</Alert>
          <a href={back} className={`self-start text-[13px] ${textLinkClass}`}>
            Voltar
          </a>
        </div>
      ) : (
        <div role="status" className="flex items-center gap-3 text-sm text-text-muted">
          <Spinner />
          Conectando…
        </div>
      )}
    </AuthLayout>
  );
}

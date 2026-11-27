import { Alert, Button, cn } from '@trama/ui';
import { useState, type ReactNode } from 'react';
import { useServices } from '../services';
import { OpenFromDriveButton } from './OpenFromDrive';
import { useDriveStatus } from './useDriveStatus';

/**
 * O cartão do Google Drive da tela Início (docs/telas/4-inicio.png): mostra se o Drive está
 * conectado e deixa conectar, conectar de novo (quando a cópia falha) e desconectar. Conectar
 * leva ao Google e volta pela tela `/drive/retorno`. Não faz nada sem a API do Trama.
 */
export function DriveConnect({ className }: { className?: string }) {
  const { drive, redirectTo } = useServices();
  const { value, setStatus } = useDriveStatus();
  const [busy, setBusy] = useState<'connect' | 'disconnect' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    if (!drive) return;
    setError(null);
    setBusy('connect');
    try {
      const { url } = await drive.startConnect(
        `${window.location.pathname}${window.location.search}`,
      );
      redirectTo(url);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não deu para conectar ao Google.');
      setBusy(null);
    }
  };

  const disconnect = async () => {
    if (!drive) return;
    setError(null);
    setBusy('disconnect');
    try {
      await drive.disconnect();
      setStatus(await drive.status());
      setConfirming(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não deu para desconectar.');
    }
    setBusy(null);
  };

  let title = 'Google Drive';
  let description = 'Verificando a conexão…';
  let dot = 'bg-text-muted';
  let actions: ReactNode = null;
  let alert: string | null = null;

  if (!drive) {
    description = 'A conexão com o Google Drive precisa da API do Trama, que não está ligada aqui.';
  } else if (value.state === 'failed') {
    description = value.message;
  } else if (value.state === 'ready') {
    const { status } = value;
    if (!status.available) {
      description = 'A conexão com o Google Drive ainda não está ligada neste ambiente.';
    } else if (!status.connected) {
      title = 'Conectar ao Google Drive';
      description =
        'Cada projeto ganha uma cópia na pasta “Trama” do seu Drive. O Trama só vê o que ele mesmo cria ou o que você abrir por ele.';
      actions = (
        <Button loading={busy === 'connect'} onClick={() => void connect()}>
          Conectar
        </Button>
      );
    } else {
      const broken = status.consecutiveFailures > 0;
      title = broken ? 'Google Drive com problema' : 'Google Drive conectado';
      dot = broken ? 'border border-text-strong' : 'bg-done';
      description = 'Cada projeto é salvo na pasta “Trama” do seu Drive.';
      if (status.email) description += ` Conta: ${status.email}.`;
      if (broken && status.lastError) alert = status.lastError;
      actions = (
        <>
          {broken && (
            <Button loading={busy === 'connect'} onClick={() => void connect()}>
              Conectar de novo
            </Button>
          )}
          {status.folderUrl && (
            <a
              href={status.folderUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center justify-center rounded-control border border-border px-3.5 text-[13px] font-semibold text-text transition-colors hover:bg-hover hover:text-text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-selection"
            >
              Abrir pasta no Drive
            </a>
          )}
          <OpenFromDriveButton />
          {confirming ? (
            <>
              <Button
                variant="secondary"
                loading={busy === 'disconnect'}
                onClick={() => void disconnect()}
              >
                Sim, desconectar
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Cancelar
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              Desconectar
            </Button>
          )}
        </>
      );
    }
  }

  return (
    <section
      aria-label="Google Drive"
      className={cn(
        'flex flex-col gap-3 rounded-block border border-border-subtle bg-surface px-5 py-4',
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden className={cn('mt-2 size-2 shrink-0 rounded-full', dot)} />
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-text-strong">{title}</h2>
            <p className="text-sm text-text-muted">{description}</p>
            {confirming && (
              <p className="mt-1 text-sm text-text-muted">
                Os arquivos continuam no seu Drive; o Trama só para de copiar.
              </p>
            )}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-start gap-2">{actions}</div>}
      </div>
      {alert && <Alert tone="error">{alert}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
    </section>
  );
}

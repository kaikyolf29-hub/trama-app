import { MCP_SCOPE_WRITE, type McpConnector } from '@trama/core';
import { Alert, Button, Spinner } from '@trama/ui';
import { useEffect, useState } from 'react';
import type { ConnectorsApi } from '../../api/connectors-api';
import { GENERIC_ERROR } from '../../auth/errors';
import { useServices } from '../../services';
import { editedLabel } from '../edited-label';
import { Section } from './Section';

const DESCRIPTION =
  'Os aplicativos de IA (Claude, ChatGPT, Codex) que você deixou usar o seu Trama. Revogar corta o acesso na hora.';

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : GENERIC_ERROR;
}

type Load =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; connectors: McpConnector[] };

/** Conectores (etapa 3.4): os clientes MCP autorizados, com permissões, último uso e "Revogar". */
export function ConnectorsSection({ api }: { api: ConnectorsApi }) {
  const { now } = useServices();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    api.list().then(
      (connectors) => alive && setLoad({ kind: 'ready', connectors }),
      (failure: unknown) => alive && setLoad({ kind: 'error', message: messageOf(failure) }),
    );
    return () => {
      alive = false;
    };
  }, [api, attempt]);

  async function revoke(id: string) {
    setError(null);
    setBusy(true);
    try {
      await api.revoke(id);
      setConfirming(null);
      setLoad((current) =>
        current.kind === 'ready'
          ? { kind: 'ready', connectors: current.connectors.filter((item) => item.id !== id) }
          : current,
      );
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(api.endpoint);
      setCopied(true);
    } catch {
      // Sem permissão para copiar: o endereço continua visível para selecionar.
    }
  }

  return (
    <Section title="Conectores" description={DESCRIPTION}>
      <div className="flex flex-col gap-5">
        <div>
          <p className="text-[13px] font-medium text-text">Endereço do conector</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <code className="font-mono text-sm break-all text-text-strong">{api.endpoint}</code>
            <Button variant="secondary" onClick={() => void copy()}>
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-text-muted">
            Cole no Claude, no ChatGPT ou no Codex como servidor MCP remoto; o login é a sua conta
            do Trama.
          </p>
        </div>

        {load.kind === 'loading' && (
          <p role="status" className="flex items-center gap-2.5 text-text-muted">
            <Spinner /> Carregando…
          </p>
        )}
        {load.kind === 'error' && (
          <div className="flex flex-col items-start gap-4">
            <Alert tone="error">{load.message}</Alert>
            <Button
              variant="secondary"
              onClick={() => {
                setLoad({ kind: 'loading' });
                setAttempt((n) => n + 1);
              }}
            >
              Tentar de novo
            </Button>
          </div>
        )}
        {error && <Alert tone="error">{error}</Alert>}
        {load.kind === 'ready' &&
          (load.connectors.length === 0 ? (
            <p className="text-sm text-text-muted">Nenhum aplicativo conectado ainda.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border-subtle">
              {load.connectors.map((connector) => (
                <li key={connector.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-medium break-words text-text-strong">
                      {connector.clientName}
                    </p>
                    <p className="mt-0.5 text-sm text-text-muted">
                      {connector.scopes.includes(MCP_SCOPE_WRITE)
                        ? 'Leitura e escrita'
                        : 'Só leitura'}
                      {' · '}
                      {connector.lastUsedAt
                        ? `Último uso ${editedLabel(connector.lastUsedAt, now())}`
                        : 'Ainda não usado'}
                    </p>
                  </div>
                  {confirming === connector.id ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm text-text-muted">Revogar o acesso?</span>
                      <Button
                        variant="secondary"
                        loading={busy}
                        onClick={() => void revoke(connector.id)}
                      >
                        Sim, revogar
                      </Button>
                      <Button variant="ghost" disabled={busy} onClick={() => setConfirming(null)}>
                        Cancelar
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="secondary"
                      aria-label={`Revogar ${connector.clientName}`}
                      onClick={() => setConfirming(connector.id)}
                    >
                      Revogar
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ))}
      </div>
    </Section>
  );
}

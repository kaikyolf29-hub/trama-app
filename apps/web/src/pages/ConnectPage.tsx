import { useRouterState } from '@tanstack/react-router';
import {
  MCP_SCOPE_READ,
  MCP_SCOPE_WRITE,
  mcpScopeHints,
  mcpScopeLabels,
  type McpConsentInfo,
  type McpScope,
} from '@trama/core';
import { Alert, Button, PasswordField, Spinner } from '@trama/ui';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/context';
import { GENERIC_ERROR } from '../auth/errors';
import { useServices } from '../services';
import { AuthLayout } from './AuthLayout';
import { Switch } from './settings/Switch';
import { textLinkClass } from './styles';

const NOT_AVAILABLE = 'O conector ainda não está ligado neste ambiente (falta VITE_MCP_URL).';

type Load =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; info: McpConsentInfo };

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : GENERIC_ERROR;
}

/**
 * Consentimento de um cliente MCP (etapa 3.4): o `/authorize` do conector traz a pessoa para cá
 * com um bilhete depois do `#`. A tela mostra quem pede, para onde o acesso vai e as permissões,
 * e só concede depois que a pessoa confirma a senha (isso abre uma sessão separada, só do
 * conector: a sessão do site não é emprestada).
 */
export function ConnectPage() {
  const { connectors, redirectTo } = useServices();
  const { client } = useAuth();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const ticket = new URLSearchParams(hash.replace(/^#/, '')).get('t');
  const [load, setLoad] = useState<Load>(() =>
    ticket && connectors
      ? { kind: 'loading' }
      : {
          kind: 'error',
          message: connectors ? 'Este endereço não tem um pedido de conexão.' : NOT_AVAILABLE,
        },
  );
  const [write, setWrite] = useState(true);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'allow' | 'deny' | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!ticket || !connectors) return;
    let alive = true;
    connectors.consentInfo(ticket).then(
      (info) => alive && setLoad({ kind: 'ready', info }),
      (failure: unknown) => alive && setLoad({ kind: 'error', message: messageOf(failure) }),
    );
    return () => {
      alive = false;
    };
  }, [connectors, ticket]);

  async function allow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (load.kind !== 'ready' || !connectors || !ticket) return;
    const raw = new FormData(event.currentTarget).get('password');
    const password = typeof raw === 'string' ? raw : '';
    if (!password) {
      setPasswordError('Digite a sua senha para confirmar.');
      return;
    }
    setPasswordError(null);
    setError(null);
    setBusy('allow');
    try {
      const session = await client.openConnectorSession(password);
      if (!session.ok) {
        setPasswordError(session.error);
        return;
      }
      const scopes: McpScope[] =
        write && load.info.scopes.includes(MCP_SCOPE_WRITE)
          ? [MCP_SCOPE_READ, MCP_SCOPE_WRITE]
          : [MCP_SCOPE_READ];
      const destination = await connectors.allow({ ticket, scopes, session: session.value });
      setLeaving(true);
      redirectTo(destination);
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setBusy(null);
    }
  }

  async function deny() {
    if (!connectors || !ticket) return;
    setError(null);
    setBusy('deny');
    try {
      setLeaving(true);
      redirectTo(await connectors.deny(ticket));
    } catch (failure) {
      setLeaving(false);
      setError(messageOf(failure));
    } finally {
      setBusy(null);
    }
  }

  if (load.kind === 'loading') {
    return (
      <AuthLayout title="Conectar um aplicativo">
        <p role="status" className="flex items-center gap-2.5 text-text-muted">
          <Spinner /> Carregando…
        </p>
      </AuthLayout>
    );
  }

  if (load.kind === 'error') {
    return (
      <AuthLayout title="Não deu para conectar">
        <div className="flex flex-col gap-4">
          <Alert tone="error">{load.message}</Alert>
          <a href="/" className={`self-start text-[13px] ${textLinkClass}`}>
            Ir para o início
          </a>
        </div>
      </AuthLayout>
    );
  }

  const { info } = load;
  const asksWrite = info.scopes.includes(MCP_SCOPE_WRITE);

  return (
    <AuthLayout
      title={`Permitir que ${info.clientName} use o seu Trama?`}
      subtitle="Este aplicativo quer ler (e, se você deixar, criar) fluxos, roteiros e estudos na sua conta."
    >
      <form noValidate onSubmit={(event) => void allow(event)} className="flex flex-col gap-5">
        <dl className="flex flex-col gap-3 text-sm">
          <div>
            <dt className="text-[13px] font-medium text-text">Aplicativo</dt>
            <dd className="mt-0.5 break-words text-text-strong">{info.clientName}</dd>
            <dd className="mt-0.5 text-xs text-text-muted">
              {info.clientDomain
                ? `Domínio verificado: ${info.clientDomain}.`
                : 'O nome é informado pelo próprio aplicativo; confira o endereço abaixo.'}
            </dd>
          </div>
          <div>
            <dt className="text-[13px] font-medium text-text">Depois de permitir, volta para</dt>
            <dd className="mt-0.5 font-mono break-all text-text-strong">{info.redirectHost}</dd>
          </div>
        </dl>

        {info.redirectIsLoopback && (
          <Alert tone="info">
            Este pedido envia o acesso para um aplicativo no seu próprio computador. Continue só se
            você acabou de iniciar a conexão por ele.
          </Alert>
        )}

        <fieldset className="flex flex-col divide-y divide-border-subtle">
          <legend className="pb-1 text-[13px] font-medium text-text">Permissões</legend>
          <div className="py-3">
            <p className="text-[15px] font-medium text-text-strong">
              {mcpScopeLabels[MCP_SCOPE_READ]}
            </p>
            <p className="mt-0.5 text-sm text-text-muted">{mcpScopeHints[MCP_SCOPE_READ]}</p>
          </div>
          {asksWrite ? (
            <Switch
              label={mcpScopeLabels[MCP_SCOPE_WRITE]}
              description={mcpScopeHints[MCP_SCOPE_WRITE]}
              checked={write}
              disabled={busy !== null}
              onChange={setWrite}
            />
          ) : null}
        </fieldset>

        <PasswordField
          label="Confirme a sua senha"
          name="password"
          autoComplete="current-password"
          error={passwordError}
          hint="Abre uma conexão separada só para este aplicativo. Você pode revogá-la a qualquer hora em Configurações."
        />

        {error && <Alert tone="error">{error}</Alert>}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={busy === 'allow'} disabled={leaving}>
            Permitir
          </Button>
          <Button
            variant="secondary"
            disabled={busy !== null || leaving}
            onClick={() => void deny()}
          >
            Recusar
          </Button>
        </div>
        {leaving && (
          <p role="status" className="flex items-center gap-2.5 text-sm text-text-muted">
            <Spinner /> Voltando para o aplicativo…
          </p>
        )}
      </form>
    </AuthLayout>
  );
}

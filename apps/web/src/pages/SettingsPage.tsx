import type { Profile } from '@trama/core';
import { Alert, Button, Spinner } from '@trama/ui';
import { useEffect, useState } from 'react';
import type { AccountApi } from '../api/account-api';
import { useAuth } from '../auth/context';
import { GENERIC_ERROR } from '../auth/errors';
import { useServices } from '../services';
import { HomeSidebar } from './HomeSidebar';
import {
  AccountSection,
  AiSection,
  EmailPreferencesSection,
  EmailSection,
  PasswordSection,
  TimeZoneSection,
} from './settings/sections';

type Load =
  { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; profile: Profile };

/** Configurações (etapa 2.5): conta, e-mail, senha, fuso e e-mails do Trama. */
export function SettingsPage() {
  const { user, client } = useAuth();
  const { account } = useServices();

  return (
    <div className="min-h-dvh bg-page md:flex">
      <HomeSidebar email={user?.email} onSignOut={() => void client.signOut()} current="settings" />
      <main className="mx-auto flex min-w-0 max-w-[720px] flex-1 flex-col gap-6 px-4 py-10 sm:px-8 md:px-12 md:py-16">
        <h1 className="text-4xl font-bold text-text-strong">Configurações</h1>
        {account ? (
          <SettingsBody api={account} />
        ) : (
          <Alert tone="info">
            A API ainda não está ligada neste ambiente. Preencha VITE_API_URL em apps/web/.env.
          </Alert>
        )}
      </main>
    </div>
  );
}

function SettingsBody({ api }: { api: AccountApi }) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });

  const [attempt, setAttempt] = useState(0);

  // Carrega ao abrir e a cada "Tentar de novo". Sem setState direto no efeito: o estado já
  // começa em "carregando", e o botão de tentar de novo o recoloca antes de subir `attempt`.
  useEffect(() => {
    let alive = true;
    api.getProfile().then(
      (profile) => alive && setLoad({ kind: 'ready', profile }),
      (error: unknown) =>
        alive &&
        setLoad({
          kind: 'error',
          message: error instanceof Error && error.message ? error.message : GENERIC_ERROR,
        }),
    );
    return () => {
      alive = false;
    };
  }, [api, attempt]);

  function retry() {
    setLoad({ kind: 'loading' });
    setAttempt((n) => n + 1);
  }

  if (load.kind === 'loading') {
    return (
      <p role="status" className="flex items-center gap-2.5 text-text-muted">
        <Spinner /> Carregando…
      </p>
    );
  }

  if (load.kind === 'error') {
    return (
      <div className="flex flex-col items-start gap-4">
        <Alert tone="error">{load.message}</Alert>
        <Button variant="secondary" onClick={retry}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  const shared = {
    profile: load.profile,
    api,
    onProfile: (profile: Profile) => setLoad({ kind: 'ready', profile }),
  };
  return (
    <>
      <AccountSection {...shared} />
      <EmailSection />
      <PasswordSection />
      <TimeZoneSection {...shared} />
      <EmailPreferencesSection {...shared} />
      <AiSection />
    </>
  );
}

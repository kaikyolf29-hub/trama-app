import { Link } from '@tanstack/react-router';
import { Button, Logo } from '@trama/ui';
import { useAuth } from '../auth/context';
import { greetingFor } from './greeting';

/**
 * Início provisório depois do login. A tela Início de verdade (tela 4: modelos,
 * recentes e o Drive) chega na etapa 1.8.
 */
export function HomePage() {
  const { user, client } = useAuth();
  const firstName = user?.name.trim().split(/\s+/)[0];

  return (
    <div className="min-h-dvh bg-page">
      <header className="flex items-center justify-between gap-4 border-b border-border-subtle px-4 py-3 sm:px-6">
        <Logo size={28} />
        <div className="flex min-w-0 items-center gap-3">
          <span className="truncate text-[13px] text-text-muted">{user?.email}</span>
          <Button variant="secondary" onClick={() => void client.signOut()}>
            Sair
          </Button>
        </div>
      </header>
      <main className="mx-auto flex max-w-[720px] flex-col gap-3 px-4 py-14 sm:px-6">
        <h1 className="font-serif text-3xl font-semibold text-text-strong">
          {greetingFor(new Date())}
          {firstName ? `, ${firstName}` : ''}
        </h1>
        <p className="text-text-muted">
          Sua conta está pronta. Os seus projetos e os modelos para começar chegam nas próximas
          etapas. Enquanto isso, veja o quadro com o fluxo de vídeo de exemplo.
        </p>
        <Link
          to="/exemplo"
          className="mt-3 inline-flex h-11 items-center self-start rounded-control bg-text-strong px-4 text-sm font-semibold text-brand-ink transition-colors hover:bg-brand-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-selection"
        >
          Abrir o quadro de exemplo
        </Link>
      </main>
    </div>
  );
}

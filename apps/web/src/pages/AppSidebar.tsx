import { Link } from '@tanstack/react-router';
import { Button, cn, LogoMark } from '@trama/ui';

const item =
  'flex h-10 shrink-0 items-center rounded-control px-3 text-[15px] transition-colors focus-visible:outline-2 focus-visible:outline-selection';

export type SidebarPage = 'home' | 'agenda';

/**
 * Barra lateral do app (telas 4 e 7). Em tela estreita vira uma faixa no alto: o espaço de
 * trabalho, o botão de sair e, embaixo, a navegação em linha.
 */
export function AppSidebar({
  current,
  email,
  onSignOut,
}: {
  current: SidebarPage;
  email?: string | undefined;
  onSignOut: () => void;
}) {
  return (
    <aside className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border-subtle bg-sidebar px-4 py-3 md:sticky md:top-0 md:h-dvh md:w-60 md:shrink-0 md:flex-col md:flex-nowrap md:items-stretch md:justify-start md:gap-6 md:border-r md:border-b-0 md:px-3 md:py-6">
      <div className="flex items-center gap-3 md:px-2">
        <LogoMark size={28} />
        <span className="text-[15px] font-semibold text-text-strong">Meu espaço</span>
      </div>

      <nav
        aria-label="Principal"
        className="order-last flex w-full gap-1 overflow-x-auto md:order-none md:w-auto md:flex-col"
      >
        <SoonItem label="Buscar" />
        <Link
          to="/"
          {...(current === 'home' ? { 'aria-current': 'page' as const } : {})}
          className={cn(item, current === 'home' ? 'bg-hover text-text-strong' : 'text-text-muted')}
        >
          Início
        </Link>
        <Link
          to="/agenda"
          {...(current === 'agenda' ? { 'aria-current': 'page' as const } : {})}
          className={cn(
            item,
            current === 'agenda' ? 'bg-hover text-text-strong' : 'text-text-muted',
          )}
        >
          Agenda
        </Link>
        <SoonItem label="Estudos" />
        <SoonItem label="Templates" />
        <SoonItem label="Configurações" />
      </nav>

      <div className="flex min-w-0 items-center gap-3 md:mt-auto md:flex-col md:items-stretch md:gap-2 md:px-2">
        {email && <span className="truncate text-[13px] text-text-muted">{email}</span>}
        <Button variant="secondary" onClick={onSignOut}>
          Sair
        </Button>
      </div>
    </aside>
  );
}

/** Item de uma etapa futura: fica no lugar da tela, desligado, como as ferramentas do quadro. */
function SoonItem({ label }: { label: string }) {
  return (
    <span
      role="link"
      aria-disabled="true"
      title="Em breve"
      className={cn(item, 'cursor-not-allowed text-text-muted')}
    >
      {label}
    </span>
  );
}

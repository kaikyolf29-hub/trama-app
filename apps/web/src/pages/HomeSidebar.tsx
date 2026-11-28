import { Link } from '@tanstack/react-router';
import { Button, cn, LogoMark } from '@trama/ui';

const item =
  'flex h-10 items-center rounded-control px-3 text-[15px] transition-colors focus-visible:outline-2 focus-visible:outline-selection';

/**
 * Barra lateral do Início (tela 4). Em tela estreita vira uma faixa no alto, só com o espaço
 * de trabalho e o botão de sair.
 */
export function HomeSidebar({
  email,
  onSignOut,
  current = 'home',
}: {
  email?: string;
  onSignOut: () => void;
  /** Qual item da barra está aberto. */
  current?: 'home' | 'settings';
}) {
  return (
    <aside className="flex items-center justify-between gap-4 border-b border-border-subtle bg-sidebar px-4 py-3 md:sticky md:top-0 md:h-dvh md:w-60 md:shrink-0 md:flex-col md:items-stretch md:justify-start md:gap-6 md:border-r md:border-b-0 md:px-3 md:py-6">
      <div className="flex items-center gap-3 md:px-2">
        <LogoMark size={28} />
        <span className="text-[15px] font-semibold text-text-strong">Meu espaço</span>
      </div>

      <nav aria-label="Principal" className="hidden flex-col gap-1 md:flex">
        <SoonItem label="Buscar" />
        <NavLink to="/" label="Início" active={current === 'home'} />
        <SoonItem label="Templates" />
        <NavLink to="/configuracoes" label="Configurações" active={current === 'settings'} />
      </nav>

      <div className="flex min-w-0 items-center gap-3 md:mt-auto md:flex-col md:items-stretch md:gap-2 md:px-2">
        <Link
          to="/configuracoes"
          aria-current={current === 'settings' ? 'page' : undefined}
          className="shrink-0 text-[13px] text-text-muted underline underline-offset-4 hover:text-text-strong md:hidden"
        >
          Configurações
        </Link>
        {email && (
          <span className="hidden truncate text-[13px] text-text-muted sm:inline md:block">
            {email}
          </span>
        )}
        <Button variant="secondary" onClick={onSignOut}>
          Sair
        </Button>
      </div>
    </aside>
  );
}

function NavLink({
  to,
  label,
  active,
}: {
  to: '/' | '/configuracoes';
  label: string;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={cn(
        item,
        active
          ? 'bg-hover text-text-strong'
          : 'text-text-muted hover:bg-hover hover:text-text-strong',
      )}
    >
      {label}
    </Link>
  );
}

/** Item de uma etapa futura: fica no lugar da tela 4, desligado, como as ferramentas do quadro. */
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

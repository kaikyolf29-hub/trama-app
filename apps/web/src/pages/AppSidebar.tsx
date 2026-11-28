import { Link } from '@tanstack/react-router';
import type { ProjectSummary } from '@trama/core';
import { Button, cn, LogoMark } from '@trama/ui';

const item =
  'flex h-10 shrink-0 items-center rounded-control px-3 text-[15px] transition-colors focus-visible:outline-2 focus-visible:outline-selection';

export type SidebarPage = 'home' | 'agenda' | 'settings';

/** Os projetos que a barra lista (tela 3: "Fluxos" e "Roteiros"), com o aberto marcado. */
export interface SidebarProjects {
  items: readonly ProjectSummary[];
  currentId?: string;
}

/**
 * Barra lateral do app (telas 4 e 7). Em tela estreita vira uma faixa no alto: o espaço de
 * trabalho, o botão de sair e, embaixo, a navegação em linha.
 */
export function AppSidebar({
  current,
  email,
  onSignOut,
  projects,
}: {
  /** Sem página ativa, por exemplo quando um projeto está aberto. */
  current?: SidebarPage;
  email?: string | undefined;
  onSignOut: () => void;
  /** Se vier, a barra lista os fluxos e os roteiros (só em tela larga). */
  projects?: SidebarProjects;
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
        <NavLink to="/" label="Início" active={current === 'home'} />
        <NavLink to="/agenda" label="Agenda" active={current === 'agenda'} />
        <SoonItem label="Estudos" />
        <SoonItem label="Templates" />
        <NavLink to="/configuracoes" label="Configurações" active={current === 'settings'} />
      </nav>

      {projects && (
        <div className="hidden min-h-0 flex-col gap-4 overflow-y-auto md:flex">
          <ProjectList title="Fluxos" kind="flow" projects={projects} />
          <ProjectList title="Roteiros" kind="script" projects={projects} />
        </div>
      )}

      <div className="flex min-w-0 items-center gap-3 md:mt-auto md:flex-col md:items-stretch md:gap-2 md:px-2">
        {email && <span className="truncate text-[13px] text-text-muted">{email}</span>}
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
  to: '/' | '/agenda' | '/configuracoes';
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

/** Uma lista curta de projetos de um tipo; some se a pessoa ainda não tem nenhum. */
function ProjectList({
  title,
  kind,
  projects,
}: {
  title: string;
  kind: ProjectSummary['kind'];
  projects: SidebarProjects;
}) {
  const items = projects.items.filter((project) => project.kind === kind).slice(0, 8);
  if (items.length === 0) return null;
  return (
    <section aria-label={title} className="flex flex-col gap-1">
      <h2 className="px-3 text-[13px] font-normal text-text-muted">{title}</h2>
      {items.map((project) => (
        <Link
          key={project.id}
          to="/p/$projectId"
          params={{ projectId: project.id }}
          aria-current={project.id === projects.currentId ? 'page' : undefined}
          title={project.title}
          className={cn(
            item,
            project.id === projects.currentId
              ? 'bg-hover text-text-strong'
              : 'text-text-muted hover:bg-hover hover:text-text-strong',
          )}
        >
          <span className="truncate">{project.title}</span>
        </Link>
      ))}
    </section>
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

import { cn } from '@trama/ui';
import type { ReactNode } from 'react';
import { useAuth } from '../../auth/context';
import { AppSidebar, type SidebarNotebook } from '../AppSidebar';

/** A casca das telas de Estudos: barra lateral (com os cadernos) e a coluna do conteúdo. */
export function StudiesShell({
  notebooks,
  cover = false,
  children,
}: {
  notebooks?: SidebarNotebook[] | undefined;
  /** A faixa pontilhada no alto da página, como na tela 6. */
  cover?: boolean;
  children: ReactNode;
}) {
  const { user, client } = useAuth();
  return (
    <div className="min-h-dvh bg-page md:flex">
      <AppSidebar
        current="studies"
        notebooks={notebooks}
        email={user?.email}
        onSignOut={() => void client.signOut()}
      />
      <main className="min-w-0 flex-1">
        {cover && (
          <div aria-hidden className="h-24 border-b border-border-subtle bg-canvas-dots md:h-36" />
        )}
        <div
          className={cn(
            'mx-auto flex max-w-[1008px] flex-col gap-8 px-4 pb-16 sm:px-8 md:px-12',
            cover ? 'pt-0' : 'pt-10 md:pt-14',
          )}
        >
          {children}
        </div>
      </main>
    </div>
  );
}

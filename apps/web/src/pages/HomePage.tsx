import { Alert } from '@trama/ui';
import { useAuth } from '../auth/context';
import { useServices } from '../services';
import { DriveStatus } from './DriveStatus';
import { AppSidebar } from './AppSidebar';
import { greetingFor } from './greeting';

import { RecentProjects } from './RecentProjects';
import { TemplateGrid } from './TemplateGrid';

/**
 * Início depois do login (tela 4): saudação, modelos para começar, projetos recentes e o
 * status do Google Drive.
 */
export function HomePage() {
  const { user, client } = useAuth();
  const { projects } = useServices();
  const firstName = user?.name.trim().split(/\s+/)[0];

  return (
    <div className="min-h-dvh bg-page md:flex">
      <AppSidebar current="home" email={user?.email} onSignOut={() => void client.signOut()} />
      <main className="mx-auto flex min-w-0 max-w-[1104px] flex-1 flex-col gap-10 px-4 py-10 sm:px-8 md:px-12 md:py-16">
        <h1 className="text-4xl font-bold text-text-strong">
          {greetingFor(new Date())}
          {firstName ? `, ${firstName}` : ''}
        </h1>
        {projects ? (
          <>
            <TemplateGrid />
            <RecentProjects api={projects} />
          </>
        ) : (
          <Alert tone="info">
            A API de projetos ainda não está ligada neste ambiente. Preencha VITE_API_URL em
            apps/web/.env.
          </Alert>
        )}
        <DriveStatus />
      </main>
    </div>
  );
}

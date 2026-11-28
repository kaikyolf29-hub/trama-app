import { useParams } from '@tanstack/react-router';
import { Spinner } from '@trama/ui';
import { useEffect, useState } from 'react';
import { useServices } from '../services';
import { realVoiceServices } from '../voice/services';
import { VoiceWorkspace } from '../voice/VoiceWorkspace';
import { PageMessage } from './PageMessage';

type Loaded =
  | { state: 'loading'; id: string }
  | { state: 'ready'; id: string; title: string }
  | { state: 'failed'; id: string; message: string };

/**
 * Rota "Falar e organizar" de um projeto (tela 5). Esta página (e com ela o microfone e o
 * Worker do Whisper) só é baixada quando a pessoa abre a tela: o router a carrega sob demanda.
 */
export function VoicePage() {
  const { projectId } = useParams({ from: '/p/$projectId/falar' });
  const { projects, voice = realVoiceServices } = useServices();
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading', id: projectId });

  useEffect(() => {
    if (!projects) return;
    let alive = true;
    projects.get(projectId).then(
      (project) => alive && setLoaded({ state: 'ready', id: projectId, title: project.title }),
      (error: unknown) =>
        alive &&
        setLoaded({
          state: 'failed',
          id: projectId,
          message: error instanceof Error ? error.message : 'Não deu para abrir o projeto.',
        }),
    );
    return () => {
      alive = false;
    };
  }, [projects, projectId]);

  if (!projects) {
    return (
      <PageMessage>
        A API de projetos ainda não está ligada neste ambiente. Preencha VITE_API_URL em
        apps/web/.env.
      </PageMessage>
    );
  }
  if (loaded.id !== projectId || loaded.state === 'loading') {
    return (
      <div
        role="status"
        className="flex h-dvh items-center justify-center gap-3 bg-page text-sm text-text-muted"
      >
        <Spinner />
        Abrindo o projeto…
      </div>
    );
  }
  if (loaded.state === 'failed') return <PageMessage>{loaded.message}</PageMessage>;
  return <VoiceWorkspace projectId={projectId} projectTitle={loaded.title} services={voice} />;
}

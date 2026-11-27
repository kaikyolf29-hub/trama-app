import { Link, useParams } from '@tanstack/react-router';
import { FlowCanvas } from '@trama/canvas';
import type { FlowProject } from '@trama/core';
import { Alert, cn, Spinner } from '@trama/ui';
import { useEffect, useRef, useState } from 'react';
import { Autosaver, type SaveStatus } from '../api/autosave';
import type { ProjectsApi } from '../api/projects-api';
import { useAuth } from '../auth/context';
import { useServices } from '../services';
import { BoardTitle, PresentButton } from './BoardChrome';
import { textLinkClass } from './styles';

type Loaded =
  | { state: 'loading'; id: string }
  | { state: 'ready'; id: string; project: FlowProject }
  | { state: 'failed'; id: string; message: string };

/** Um projeto aberto no quadro: carrega pela API e salva sozinho 2 s depois de cada mudança. */
export function ProjectPage() {
  const { projectId } = useParams({ from: '/p/$projectId' });
  const { projects } = useServices();
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading', id: projectId });

  useEffect(() => {
    if (!projects) return;
    let alive = true;
    projects.get(projectId).then(
      (project) => alive && setLoaded({ state: 'ready', id: projectId, project }),
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
      <Message>
        A API de projetos ainda não está ligada neste ambiente. Preencha VITE_API_URL em
        apps/web/.env.
      </Message>
    );
  }
  // Trocou de projeto: até o novo carregar, mostra o carregando (e não o anterior).
  if (loaded.id !== projectId || loaded.state === 'loading') {
    return (
      <div
        role="status"
        className="flex h-dvh items-center justify-center gap-3 bg-canvas text-sm text-text-muted"
      >
        <Spinner />
        Abrindo o projeto…
      </div>
    );
  }
  if (loaded.state === 'failed') return <Message>{loaded.message}</Message>;
  return <ProjectBoard key={loaded.project.id} project={loaded.project} api={projects} />;
}

function Message({ children }: { children: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-page px-4">
      <div className="flex max-w-md flex-col gap-4">
        <Alert tone="error">{children}</Alert>
        <Link to="/" className={cn(textLinkClass, 'self-start text-sm')}>
          Voltar para o início
        </Link>
      </div>
    </div>
  );
}

function ProjectBoard({ project, api }: { project: FlowProject; api: ProjectsApi }) {
  const { mediaFor, autosaveDelay } = useServices();
  const { user } = useAuth();
  const [status, setStatus] = useState<SaveStatus>({ kind: 'saved', at: project.updatedAt });
  const saver = useRef<Autosaver | null>(null);
  const [media] = useState(() => mediaFor(user?.id ?? ''));

  useEffect(() => {
    const autosaver = new Autosaver(
      (content, baseRevision, options) => api.save(project.id, { content, baseRevision }, options),
      { revision: project.revision, onStatus: setStatus },
      autosaveDelay,
    );
    saver.current = autosaver;
    // Ao trocar de aba ou fechar, salva na hora; ao fechar com mudança pendente, avisa.
    const onHide = () => {
      if (document.visibilityState === 'hidden') void autosaver.flush({ keepalive: true });
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!autosaver.dirty) return;
      void autosaver.flush({ keepalive: true });
      event.preventDefault();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
      // Saindo do projeto pelo app: salva o que faltar antes de largar.
      void autosaver.flush().finally(() => autosaver.dispose());
      saver.current = null;
    };
  }, [api, project.id, project.revision, autosaveDelay]);

  return (
    <div className="h-dvh w-full">
      <FlowCanvas
        flow={project.content}
        media={media}
        onFlowChange={(next) => saver.current?.push(next)}
        topLeft={
          <BoardTitle
            section="Fluxos"
            title={project.title}
            aside={<SaveIndicator status={status} />}
          />
        }
        topRight={<PresentButton />}
      />
    </div>
  );
}

const SAVE_TEXT: Record<SaveStatus['kind'], string> = {
  saved: 'Salvo',
  pending: 'Alterações não salvas',
  saving: 'Salvando…',
  error: 'Não salvou',
};

/** O "● Salvo" da tela 1: verde quando está tudo guardado. */
export function SaveIndicator({ status }: { status: SaveStatus }) {
  const title =
    status.kind === 'error'
      ? `${status.message} Tentando de novo em ${Math.round(status.retryInMs / 1000)} s.`
      : undefined;
  return (
    <span
      role="status"
      aria-live="polite"
      title={title}
      className={cn(
        'ml-1 flex items-center gap-1.5 text-[13px]',
        status.kind === 'error' ? 'text-text-strong' : 'text-text-muted',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'size-1.5 rounded-full',
          status.kind === 'saved' && 'bg-done',
          (status.kind === 'pending' || status.kind === 'saving') && 'bg-text-muted',
          status.kind === 'error' && 'border border-text-strong',
        )}
      />
      {SAVE_TEXT[status.kind]}
    </span>
  );
}

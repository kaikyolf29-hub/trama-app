import { Link } from '@tanstack/react-router';
import type { Editor, JSONContent } from '@tiptap/core';
import {
  projectStatusLabels,
  projectStatusSchema,
  addScene,
  createScene,
  type FlowProject,
  type ProjectStatus,
  type ProjectSummary,
  type ScriptContent,
  type ScriptProject,
} from '@trama/core';
import { Button, cn } from '@trama/ui';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Autosaver, type SaveStatus } from '../../api/autosave';
import type { ProjectsApi } from '../../api/projects-api';
import { useAuth } from '../../auth/context';
import { useServices } from '../../services';
import { AppSidebar } from '../AppSidebar';
import { SaveIndicator } from '../SaveIndicator';
import { textLinkClass } from '../styles';
import {
  bringCardsFromBoard,
  createCardsOnBoard,
  updateBoardFromScript,
  updateScriptFromBoard,
} from './board';
import { docToScenes } from './doc';
import { focusScene, setEditorScenes } from './editor-commands';
import { ScriptEditor } from './ScriptEditor';
import { ScenesPanel, type BoardAction, type BoardNotice } from './ScenesPanel';

/** O que o salvamento automático leva: o título e as cenas. */
interface Draft {
  title: string;
  content: ScriptContent;
}

const statusTone: Record<ProjectStatus, string> = {
  draft: 'bg-note-yellow-bg text-note-yellow-fg',
  in_progress: 'bg-note-blue-bg text-note-blue-fg',
  done: 'bg-done-surface text-done-text',
};

const sameScenes = (a: ScriptContent['scenes'], b: ScriptContent['scenes']) =>
  JSON.stringify(a) === JSON.stringify(b);

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const fieldClass =
  'rounded-tag bg-transparent text-text-strong outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-selection';

/**
 * O roteiro aberto (tela 3): título, fluxo vinculado, duração alvo e as cenas no editor, com a
 * lista "Cenas no fluxo" ao lado. Salva sozinho 2 s depois de cada mudança, como o quadro.
 */
export function ScriptScreen({ project, api }: { project: ScriptProject; api: ProjectsApi }) {
  const { autosaveDelay } = useServices();
  const { user, client } = useAuth();
  const [status, setStatus] = useState<SaveStatus>({ kind: 'saved', at: project.updatedAt });
  const [title, setTitle] = useState(project.title);
  const [script, setScript] = useState(project.content);
  const [projectStatus, setProjectStatus] = useState(project.status);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [busy, setBusy] = useState<BoardAction | null>(null);
  const [notice, setNotice] = useState<BoardNotice | null>(null);
  const [changingFlow, setChangingFlow] = useState(false);
  const [initialScenes] = useState(project.content.scenes);

  const draft = useRef<Draft>({ title: project.title, content: project.content });
  const lastTitle = useRef(project.title);
  const saver = useRef<Autosaver<Draft> | null>(null);
  const editor = useRef<Editor | null>(null);

  useEffect(() => {
    const autosaver = new Autosaver<Draft>(
      (value, baseRevision, options) =>
        api.save(
          project.id,
          {
            content: value.content,
            // Título em branco não vale: o projeto fica com o último nome.
            ...(value.title.trim() ? { title: value.title.trim().slice(0, 200) } : {}),
            baseRevision,
          },
          options,
        ),
      { revision: project.revision, onStatus: setStatus },
      autosaveDelay,
    );
    saver.current = autosaver;
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
      // Saindo do roteiro pelo app: salva o que faltar antes de largar.
      void autosaver.flush().finally(() => autosaver.dispose());
      saver.current = null;
    };
  }, [api, project.id, project.revision, autosaveDelay]);

  useEffect(() => {
    let alive = true;
    api.list().then(
      (list) => alive && setProjects(list),
      // Sem a lista, o roteiro funciona do mesmo jeito: só não há fluxos para escolher.
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [api]);

  /** Toda mudança passa por aqui: guarda, mostra e agenda o salvamento. */
  const commit = useCallback((patch: Partial<Draft>, syncEditor = false) => {
    const next = { ...draft.current, ...patch };
    draft.current = next;
    if (patch.content) setScript(patch.content);
    if (patch.title !== undefined) setTitle(patch.title);
    if (syncEditor && patch.content && editor.current) {
      setEditorScenes(editor.current, patch.content.scenes);
    }
    saver.current?.push(next);
  }, []);

  const onDoc = useCallback(
    (doc: JSONContent) => {
      const current = draft.current.content;
      const scenes = docToScenes(doc, current.scenes);
      if (sameScenes(scenes, current.scenes)) return;
      commit({ content: { ...current, scenes } });
    },
    [commit],
  );
  const onEditor = useCallback((next: Editor | null) => {
    editor.current = next;
  }, []);

  const flows = projects.filter((item) => item.kind === 'flow');
  const linkedFlow = flows.find((item) => item.id === script.flowId);

  const setFlowId = (flowId: string | null) => {
    commit({ content: { ...draft.current.content, flowId } });
    setChangingFlow(false);
  };

  const createFlow = async (): Promise<FlowProject> => {
    const created = await api.create({
      kind: 'flow',
      title: draft.current.title.trim() || 'Fluxo do roteiro',
    });
    if (created.kind !== 'flow') throw new Error('Não deu para criar o fluxo.');
    setProjects((list) => [
      {
        id: created.id,
        kind: 'flow',
        title: created.title,
        status: created.status,
        revision: created.revision,
        updatedAt: created.updatedAt,
      },
      ...list,
    ]);
    return created;
  };

  const changeStatus = async (next: ProjectStatus) => {
    const before = projectStatus;
    setProjectStatus(next);
    try {
      await api.update(project.id, { status: next });
    } catch {
      setProjectStatus(before);
    }
  };

  /** "Criar no quadro", "Trazer do quadro" e as duas atualizações: um clique, um lado. */
  const runBoard = async (action: BoardAction) => {
    setBusy(action);
    setNotice(null);
    try {
      let flowId = draft.current.content.flowId;
      let flow: FlowProject;
      if (flowId === null) {
        // Sem fluxo ligado, "Criar no quadro" cria um fluxo novo e liga o roteiro a ele.
        flow = await createFlow();
        flowId = flow.id;
        commit({ content: { ...draft.current.content, flowId } });
      } else {
        const opened = await api.get(flowId);
        if (opened.kind !== 'flow')
          throw new Error('O projeto ligado a este roteiro não é um fluxo.');
        flow = opened;
      }

      const current = draft.current.content;
      const result = {
        create: createCardsOnBoard,
        bring: bringCardsFromBoard,
        fromBoard: updateScriptFromBoard,
        toBoard: updateBoardFromScript,
      }[action](current, flow.content);

      // O quadro é gravado com a revisão que acabou de ser lida: nada é sobrescrito sem aviso.
      if (result.flow !== flow.content) {
        await api.save(flowId, { content: result.flow, baseRevision: flow.revision });
      }
      if (!sameScenes(result.script.scenes, current.scenes)) {
        commit({ content: result.script }, action === 'bring' || action === 'fromBoard');
        void saver.current?.flush();
      }
      setNotice({ tone: 'info', text: describe(action, result.changed, current), flowId });
    } catch (error) {
      setNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Não deu para falar com o quadro.',
      });
    } finally {
      setBusy(null);
    }
  };

  const addNextScene = () => {
    const scene = createScene();
    const content = addScene(draft.current.content, scene);
    commit({ content }, true);
    // O editor acabou de ganhar o título novo; o foco vai para ele.
    requestAnimationFrame(() => {
      const current = editor.current;
      if (!current) return;
      const created = docToScenes(current.getJSON(), content.scenes).at(-1);
      if (created) focusScene(current, created.id);
    });
  };

  const sidebarItems = projects.map((item) =>
    item.id === project.id ? { ...item, title: title.trim() || item.title } : item,
  );

  return (
    <div className="min-h-dvh bg-page md:flex">
      <AppSidebar
        email={user?.email}
        onSignOut={() => void client.signOut()}
        projects={{ items: sidebarItems, currentId: project.id }}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-8">
          <nav aria-label="Onde você está" className="flex min-w-0 items-center gap-3 text-[15px]">
            <Link
              to="/"
              className="text-text-muted transition-colors hover:text-text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-selection"
            >
              Roteiros
            </Link>
            <span className="text-text-muted" aria-hidden>
              /
            </span>
            <span className="truncate text-text-strong">{title.trim() || 'Sem título'}</span>
          </nav>
          <div className="flex items-center gap-4">
            <SaveIndicator status={status} />
            <Button
              variant="secondary"
              onClick={() => void runBoard('create')}
              loading={busy === 'create'}
              disabled={busy !== null}
            >
              Criar no quadro
            </Button>
          </div>
        </header>

        <div className="flex flex-col gap-10 px-4 pt-4 pb-24 sm:px-8 xl:flex-row xl:justify-center xl:gap-[72px] xl:px-12">
          <main className="flex min-w-0 flex-col gap-8 xl:w-[700px] xl:shrink-0">
            <h1 className="sr-only">Roteiro: {title.trim() || 'Sem título'}</h1>
            <input
              value={title}
              maxLength={200}
              aria-label="Título do roteiro"
              placeholder="Sem título"
              onChange={(event) => commit({ title: event.target.value })}
              onBlur={() => {
                // Título em branco volta para o último nome.
                if (draft.current.title.trim() === '') commit({ title: lastTitle.current });
                else lastTitle.current = draft.current.title.trim();
              }}
              className={cn(
                fieldClass,
                'w-full text-[32px] leading-tight font-bold sm:text-[40px]',
              )}
            />

            <dl className="flex flex-col gap-3 border-b border-border-subtle pb-6 text-[15px]">
              <MetaRow label="Status">
                <select
                  aria-label="Status do roteiro"
                  value={projectStatus}
                  onChange={(event) =>
                    void changeStatus(projectStatusSchema.parse(event.target.value))
                  }
                  className={cn(
                    'cursor-pointer rounded-tag px-2 py-0.5 text-[15px] outline-none focus-visible:outline-2 focus-visible:outline-selection',
                    statusTone[projectStatus],
                  )}
                >
                  {projectStatusSchema.options.map((value) => (
                    <option key={value} value={value} className="bg-floating text-text-strong">
                      {projectStatusLabels[value]}
                    </option>
                  ))}
                </select>
              </MetaRow>
              <MetaRow label="Fluxo vinculado" id="fluxo-vinculado">
                {linkedFlow && !changingFlow ? (
                  <span className="flex flex-wrap items-center gap-3">
                    <Link
                      to="/p/$projectId"
                      params={{ projectId: linkedFlow.id }}
                      className={cn(textLinkClass, 'text-text-strong')}
                    >
                      {linkedFlow.title}
                    </Link>
                    <Button variant="ghost" onClick={() => setChangingFlow(true)}>
                      Trocar
                    </Button>
                  </span>
                ) : (
                  <span className="flex flex-wrap items-center gap-3">
                    <select
                      aria-label="Fluxo vinculado"
                      value={script.flowId ?? ''}
                      onChange={(event) => setFlowId(event.target.value || null)}
                      className={cn(fieldClass, 'max-w-60 cursor-pointer text-[15px]')}
                    >
                      <option value="" className="bg-floating">
                        Escolher um fluxo…
                      </option>
                      {flows.map((flow) => (
                        <option key={flow.id} value={flow.id} className="bg-floating">
                          {flow.title}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="ghost"
                      disabled={busy !== null}
                      onClick={() =>
                        void createFlow().then(
                          (created) => setFlowId(created.id),
                          (error: unknown) =>
                            setNotice({
                              tone: 'error',
                              text:
                                error instanceof Error
                                  ? error.message
                                  : 'Não deu para criar o fluxo.',
                            }),
                        )
                      }
                    >
                      Criar um fluxo novo
                    </Button>
                  </span>
                )}
              </MetaRow>
              <MetaRow label="Duração alvo">
                <input
                  value={script.targetDuration}
                  maxLength={40}
                  aria-label="Duração alvo"
                  placeholder="Ex.: 8–10 min"
                  onChange={(event) =>
                    commit({
                      content: { ...draft.current.content, targetDuration: event.target.value },
                    })
                  }
                  className={cn(fieldClass, 'w-48 text-[15px]')}
                />
              </MetaRow>
            </dl>

            <ScriptEditor initial={initialScenes} onDoc={onDoc} onEditor={onEditor} />
          </main>

          <ScenesPanel
            scenes={script.scenes}
            flowLinked={script.flowId !== null}
            busy={busy}
            notice={notice}
            onSelect={(sceneId) => editor.current && focusScene(editor.current, sceneId)}
            onAdd={addNextScene}
            onAction={(action) => void runBoard(action)}
          />
        </div>
      </div>
    </div>
  );
}

function MetaRow({ label, id, children }: { label: string; id?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 sm:flex-nowrap">
      <dt id={id} className="w-40 shrink-0 text-text-muted">
        {label}
      </dt>
      <dd className="min-w-0 text-text-strong">{children}</dd>
    </div>
  );
}

function describe(action: BoardAction, changed: number, before: ScriptContent): string {
  if (action === 'create') {
    if (before.scenes.length === 0) return 'O roteiro ainda não tem cenas para levar ao quadro.';
    return changed > 0
      ? `${plural(changed, 'cartão criado', 'cartões criados')} no quadro.`
      : 'Todas as cenas já têm cartão no quadro.';
  }
  if (action === 'bring') {
    return changed > 0
      ? `${plural(changed, 'cartão trazido', 'cartões trazidos')} do quadro como cena.`
      : 'Não há cartões novos no quadro.';
  }
  if (action === 'fromBoard') {
    return changed > 0
      ? `${plural(changed, 'cena atualizada', 'cenas atualizadas')} com o que está no quadro.`
      : 'As cenas já estão iguais aos cartões do quadro.';
  }
  return changed > 0
    ? `${plural(changed, 'cartão atualizado', 'cartões atualizados')} no quadro.`
    : 'Os cartões do quadro já estão iguais às cenas.';
}

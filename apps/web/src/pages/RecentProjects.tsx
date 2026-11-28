import { Link } from '@tanstack/react-router';
import {
  projectKindLabels,
  projectStatusLabels,
  projectStatusSchema,
  type ProjectStatus,
  type ProjectSummary,
} from '@trama/core';
import { Alert, Button, cn, Spinner } from '@trama/ui';
import { PencilIcon, TrashIcon } from '@trama/ui/icons';
import { useEffect, useRef, useState } from 'react';
import type { ProjectsApi } from '../api/projects-api';
import { editedLabel } from './edited-label';

/** Quantos projetos aparecem de início; o resto fica atrás de "Mostrar todos". */
const VISIBLE = 10;

type ListState =
  | { state: 'loading' }
  | { state: 'ready'; projects: ProjectSummary[] }
  | { state: 'failed'; message: string };

const messageOf = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

/** O mais recente primeiro, como a API devolve. */
const byRecent = (a: ProjectSummary, b: ProjectSummary) => b.updatedAt.localeCompare(a.updatedAt);

const iconButton =
  'inline-flex size-8 items-center justify-center rounded-control text-text-muted transition-colors hover:bg-hover hover:text-text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-selection disabled:cursor-not-allowed disabled:opacity-60';

/**
 * "Recentes" (tela 4): nome, tipo, status e quando foi editado, com renomear, mudar o
 * status e apagar (com confirmação) em cada linha.
 */
export function RecentProjects({ api }: { api: ProjectsApi }) {
  const [list, setList] = useState<ListState>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.list().then(
      (projects) => alive && setList({ state: 'ready', projects }),
      (error: unknown) =>
        alive &&
        setList({
          state: 'failed',
          message: messageOf(error, 'Não deu para carregar os projetos.'),
        }),
    );
    return () => {
      alive = false;
    };
  }, [api, attempt]);

  const change = (updated: ProjectSummary) =>
    setList((current) =>
      current.state === 'ready'
        ? {
            state: 'ready',
            projects: current.projects
              .map((project) => (project.id === updated.id ? updated : project))
              .sort(byRecent),
          }
        : current,
    );

  /** Roda uma ação de uma linha: trava a linha, mostra o erro e devolve se deu certo. */
  const run = async (id: string, action: () => Promise<void>, fallback: string) => {
    setBusy(id);
    setActionError(null);
    try {
      await action();
      return true;
    } catch (error) {
      setActionError(messageOf(error, fallback));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const rename = async (project: ProjectSummary, title: string) => {
    setRenaming(null);
    const next = title.trim();
    if (!next || next === project.title) return;
    await run(
      project.id,
      async () => change(await api.update(project.id, { title: next })),
      'Não deu para renomear.',
    );
  };

  const setStatus = (project: ProjectSummary, status: ProjectStatus) =>
    run(
      project.id,
      async () => change(await api.update(project.id, { status })),
      'Não deu para mudar o status.',
    );

  const remove = async (project: ProjectSummary) => {
    const done = await run(
      project.id,
      async () => {
        await api.remove(project.id);
        setList((current) =>
          current.state === 'ready'
            ? { state: 'ready', projects: current.projects.filter((p) => p.id !== project.id) }
            : current,
        );
      },
      'Não deu para apagar.',
    );
    // Se falhou, a confirmação fica aberta para tentar de novo ou cancelar.
    if (done) setConfirming(null);
  };

  return (
    <section aria-labelledby="recentes" className="flex flex-col gap-4">
      <h2 id="recentes" className="text-sm text-text-muted">
        Recentes
      </h2>

      {actionError && <Alert tone="error">{actionError}</Alert>}

      {list.state === 'loading' && (
        <p role="status" className="flex items-center gap-2 px-3 text-sm text-text-muted">
          <Spinner /> Carregando seus projetos…
        </p>
      )}

      {list.state === 'failed' && (
        <div className="flex flex-col items-start gap-3">
          <Alert tone="error" className="self-stretch">
            {list.message}
          </Alert>
          <Button
            variant="secondary"
            onClick={() => {
              setList({ state: 'loading' });
              setAttempt((n) => n + 1);
            }}
          >
            Tentar de novo
          </Button>
        </div>
      )}

      {list.state === 'ready' && list.projects.length === 0 && (
        <p className="px-3 py-4 text-sm text-text-muted">
          Nenhum projeto ainda. Escolha um modelo acima para começar, ou veja o{' '}
          <Link
            to="/exemplo"
            className="font-medium text-text underline decoration-border underline-offset-4 hover:text-text-strong"
          >
            fluxo de vídeo de exemplo
          </Link>
          .
        </p>
      )}

      {list.state === 'ready' && list.projects.length > 0 && (
        <>
          <table className="w-full table-fixed border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-[13px] font-normal text-text-muted">
                <th scope="col" className="px-3 py-3 font-normal">
                  Nome
                </th>
                <th scope="col" className="hidden w-28 px-3 py-3 font-normal md:table-cell">
                  Tipo
                </th>
                <th scope="col" className="w-40 px-3 py-3 font-normal">
                  Status
                </th>
                <th scope="col" className="hidden w-32 px-3 py-3 font-normal sm:table-cell">
                  Editado
                </th>
                <th scope="col" className="w-20 px-3 py-3 font-normal">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(showAll ? list.projects : list.projects.slice(0, VISIBLE)).map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  disabled={busy === project.id}
                  renaming={renaming === project.id}
                  confirming={confirming === project.id}
                  onStartRename={() => {
                    setConfirming(null);
                    setRenaming(project.id);
                  }}
                  onRename={(title) => void rename(project, title)}
                  onCancelRename={() => setRenaming(null)}
                  onStatus={(status) => void setStatus(project, status)}
                  onAskRemove={() => {
                    setRenaming(null);
                    setActionError(null);
                    setConfirming(project.id);
                  }}
                  onCancelRemove={() => setConfirming(null)}
                  onRemove={() => void remove(project)}
                />
              ))}
            </tbody>
          </table>
          {!showAll && list.projects.length > VISIBLE && (
            <div>
              <Button variant="ghost" onClick={() => setShowAll(true)}>
                Mostrar todos ({list.projects.length})
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

interface RowProps {
  project: ProjectSummary;
  disabled: boolean;
  renaming: boolean;
  confirming: boolean;
  onStartRename: () => void;
  onRename: (title: string) => void;
  onCancelRename: () => void;
  onStatus: (status: ProjectStatus) => void;
  onAskRemove: () => void;
  onCancelRemove: () => void;
  onRemove: () => void;
}

function ProjectRow({
  project,
  disabled,
  renaming,
  confirming,
  onStartRename,
  onRename,
  onCancelRename,
  onStatus,
  onAskRemove,
  onCancelRemove,
  onRemove,
}: RowProps) {
  const row = 'border-b border-border-subtle';

  if (confirming) {
    return (
      <tr className={row}>
        <td colSpan={5} className="px-3 py-3">
          <div
            role="group"
            aria-label={`Apagar ${project.title}`}
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <p className="min-w-0 text-text">
              Apagar <strong className="font-semibold text-text-strong">“{project.title}”</strong>?
              O fluxo e o histórico de versões somem e não dá para desfazer.
            </p>
            <div className="flex shrink-0 gap-2">
              <Button variant="secondary" autoFocus onClick={onCancelRemove} disabled={disabled}>
                Cancelar
              </Button>
              <Button onClick={onRemove} loading={disabled}>
                Apagar
              </Button>
            </div>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className={cn(row, 'transition-colors hover:bg-hover/40', disabled && 'opacity-60')}>
      <td className="px-3 py-1.5">
        {renaming ? (
          <RenameField initial={project.title} onDone={onRename} onCancel={onCancelRename} />
        ) : project.kind === 'notebook' ? (
          <Link
            to="/estudos/$notebookId"
            params={{ notebookId: project.id }}
            title={project.title}
            className="block truncate rounded-tag py-1.5 text-text-strong hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-selection"
          >
            {project.title}
          </Link>
        ) : (
          <Link
            to="/p/$projectId"
            params={{ projectId: project.id }}
            title={project.title}
            className="block truncate rounded-tag py-1.5 text-text-strong hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-selection"
          >
            {project.title}
          </Link>
        )}
        {!renaming && (
          <span className="block text-xs text-text-muted sm:hidden">
            {editedLabel(project.updatedAt)}
          </span>
        )}
      </td>
      <td className="hidden px-3 py-1.5 text-text-muted md:table-cell">
        {projectKindLabels[project.kind]}
      </td>
      <td className="px-3 py-1.5">
        <select
          aria-label={`Status de ${project.title}`}
          value={project.status}
          disabled={disabled}
          onChange={(event) => onStatus(projectStatusSchema.parse(event.target.value))}
          className={cn(
            'h-8 w-full rounded-control border border-transparent bg-transparent px-2 text-[13px] transition-colors',
            'hover:border-border hover:bg-hover focus-visible:outline-2 focus-visible:outline-selection',
            project.status === 'done' ? 'text-done-text' : 'text-text-muted',
          )}
        >
          {projectStatusSchema.options.map((status) => (
            <option key={status} value={status}>
              {projectStatusLabels[status]}
            </option>
          ))}
        </select>
      </td>
      <td className="hidden px-3 py-1.5 text-text-muted sm:table-cell">
        <time dateTime={project.updatedAt}>{editedLabel(project.updatedAt)}</time>
      </td>
      <td className="px-3 py-1.5">
        <div className="flex justify-end gap-0.5">
          <button
            type="button"
            className={iconButton}
            aria-label={`Renomear ${project.title}`}
            title="Renomear"
            disabled={disabled}
            onClick={onStartRename}
          >
            <PencilIcon size={14} aria-hidden />
          </button>
          <button
            type="button"
            className={iconButton}
            aria-label={`Apagar ${project.title}`}
            title="Apagar"
            disabled={disabled}
            onClick={onAskRemove}
          >
            <TrashIcon size={14} aria-hidden />
          </button>
        </div>
      </td>
    </tr>
  );
}

/** Campo no lugar do nome: Enter ou sair do campo confirmam, Esc cancela (como no quadro). */
function RenameField({
  initial,
  onDone,
  onCancel,
}: {
  initial: string;
  onDone: (title: string) => void;
  onCancel: () => void;
}) {
  const finished = useRef(false);
  const finish = (action: () => void) => {
    // Esc ou Enter desmontam o campo, que ainda pode disparar o blur: só vale a primeira saída.
    if (finished.current) return;
    finished.current = true;
    action();
  };
  return (
    <input
      aria-label="Novo nome"
      autoFocus
      maxLength={200}
      defaultValue={initial}
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') finish(() => onDone(event.currentTarget.value));
        if (event.key === 'Escape') finish(onCancel);
      }}
      onBlur={(event) => finish(() => onDone(event.currentTarget.value))}
      className="h-8 w-full rounded-control border border-border bg-field px-2 text-text-strong focus-visible:outline-2 focus-visible:outline-selection"
    />
  );
}

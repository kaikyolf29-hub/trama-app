import { Link, useNavigate } from '@tanstack/react-router';
import type { ProjectSummary } from '@trama/core';
import { Alert, Button } from '@trama/ui';
import { useEffect, useState } from 'react';
import { useServices } from '../services';

type ListState =
  | { state: 'loading' }
  | { state: 'ready'; projects: ProjectSummary[] }
  | { state: 'failed'; message: string };

function editedAt(iso: string): string {
  const date = new Date(iso);
  return date
    .toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
    .replace(/\./g, '')
    .replace(/ de /g, ' ');
}

/**
 * Os fluxos da pessoa e o botão de criar um novo (em um clique já abre no quadro). A tela
 * Início completa, com os modelos, chega na etapa 1.8 (tela 4).
 */
export function ProjectList() {
  const { projects } = useServices();
  const navigate = useNavigate();
  const [list, setList] = useState<ListState>({ state: 'loading' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!projects) return;
    let alive = true;
    projects.list().then(
      (items) => alive && setList({ state: 'ready', projects: items }),
      (error: unknown) =>
        alive &&
        setList({
          state: 'failed',
          message: error instanceof Error ? error.message : 'Não deu para carregar os projetos.',
        }),
    );
    return () => {
      alive = false;
    };
  }, [projects]);

  if (!projects) return null;

  const createFlow = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const project = await projects.create({ kind: 'flow' });
      await navigate({ to: '/p/$projectId', params: { projectId: project.id } });
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Não deu para criar o fluxo.');
      setCreating(false);
    }
  };

  return (
    <section aria-labelledby="seus-fluxos" className="mt-8 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <h2 id="seus-fluxos" className="text-sm font-semibold text-text-strong">
          Seus fluxos
        </h2>
        <Button onClick={() => void createFlow()} disabled={creating}>
          {creating ? 'Criando…' : 'Novo fluxo'}
        </Button>
      </div>
      {createError && <Alert tone="error">{createError}</Alert>}
      {list.state === 'loading' && <p className="text-sm text-text-muted">Carregando…</p>}
      {list.state === 'failed' && <Alert tone="error">{list.message}</Alert>}
      {list.state === 'ready' && list.projects.length === 0 && (
        <p className="text-sm text-text-muted">
          Nenhum fluxo ainda. Crie o primeiro com “Novo fluxo”.
        </p>
      )}
      {list.state === 'ready' && list.projects.length > 0 && (
        <ul className="flex flex-col divide-y divide-border-subtle rounded-block border border-border bg-surface">
          {list.projects.map((project) => (
            <li key={project.id}>
              <Link
                to="/p/$projectId"
                params={{ projectId: project.id }}
                className="flex items-center justify-between gap-4 px-4 py-3 text-sm transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-selection"
              >
                <span className="truncate text-text-strong">{project.title}</span>
                <span className="shrink-0 text-xs text-text-muted">
                  Editado {editedAt(project.updatedAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

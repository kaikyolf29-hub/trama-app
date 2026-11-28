import { useNavigate } from '@tanstack/react-router';
import {
  createProjectRequestFromTemplate,
  flowTemplates,
  type FlowTemplate,
  type FlowTemplateId,
} from '@trama/core';
import { Alert, cn } from '@trama/ui';
import { useState } from 'react';
import { useServices } from '../services';

/**
 * "Começar algo novo" (tela 4): um clique num modelo cria o projeto e já abre no quadro,
 * dentro do limite de 3 cliques para criar um fluxo.
 */
export function TemplateGrid() {
  const { projects } = useServices();
  const navigate = useNavigate();
  const [creating, setCreating] = useState<FlowTemplateId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async (template: FlowTemplate) => {
    if (!projects || creating) return;
    setCreating(template.id);
    setError(null);
    try {
      const project = await projects.create(createProjectRequestFromTemplate(template));
      // "Falar e organizar" abre a tela de voz do projeto (tela 5); os outros, o quadro.
      await navigate({
        to: template.id === 'voice' ? '/p/$projectId/falar' : '/p/$projectId',
        params: { projectId: project.id },
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não deu para criar o fluxo.');
      setCreating(null);
    }
  };

  return (
    <section aria-labelledby="comecar" className="flex flex-col gap-4">
      <h2 id="comecar" className="text-sm text-text-muted">
        Começar algo novo
      </h2>
      {error && <Alert tone="error">{error}</Alert>}
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {flowTemplates.map((template) => (
          <li key={template.id} className="flex">
            <button
              type="button"
              disabled={!projects || creating !== null}
              aria-busy={creating === template.id || undefined}
              onClick={() => void start(template)}
              className={cn(
                'flex min-h-20 w-full flex-col items-start justify-center gap-0.5 rounded-block border border-border bg-surface px-5 py-4 text-left transition-colors',
                'hover:border-text-strong focus-visible:border-text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-selection',
                'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border',
              )}
            >
              <span className="text-base font-semibold text-text-strong">{template.title}</span>
              <span className="text-[13px] text-text-muted">
                {creating === template.id ? 'Criando…' : template.description}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

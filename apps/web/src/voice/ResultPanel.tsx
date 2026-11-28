import { Link, useNavigate } from '@tanstack/react-router';
import {
  aiOutputToFlow,
  aiOutputToScript,
  promptOutputToText,
  type AiCorrection,
  type AiOrganizeFormat,
  type AiOrganizeResponse,
  type ScriptContent,
  type FlowContent,
} from '@trama/core';
import { Alert, Button, Spinner } from '@trama/ui';
import { useMemo, useState } from 'react';
import { useServices } from '../services';
import { copyText } from './copy';
import { FlowPreview } from './FlowPreview';
import { createScriptProject, insertFlowIntoProject } from './insert';
import { canRetry, formatHints, insertLabels, needsSettings, providerShortName } from './organize';
import { ScriptPreview } from './ScriptPreview';
import type { OrganizeFailure, Readiness, RunState } from './use-organizer';

const sectionLabel = 'text-[13px] font-semibold tracking-wider text-text-muted uppercase';

/**
 * O lado direito da tela 5, "A IA entendeu assim": o que ainda falta para organizar, o
 * carregando, o erro, ou o resultado com as correções e os botões "Refazer" e "Inserir no quadro".
 */
export function ResultPanel({
  projectId,
  readiness,
  run,
  text,
  format,
  onOrganize,
}: {
  projectId: string;
  readiness: Readiness;
  run: RunState;
  text: string;
  format: AiOrganizeFormat;
  onOrganize: () => void;
}) {
  const done = run.kind === 'done' ? run : null;
  const stale = done !== null && (done.text !== text.trim() || done.format !== format);

  return (
    <section
      aria-label="O que a IA entendeu"
      className="bg-canvas-dots flex min-h-[320px] flex-col gap-6 rounded-block border border-border p-6"
    >
      {done ? (
        // Um resultado novo recomeça a inserção do zero.
        <ResultView
          key={done.id}
          response={done.response}
          projectId={projectId}
          stale={stale}
          onRedo={onOrganize}
          redoDisabled={false}
        />
      ) : (
        <>
          <PanelHeader>
            <Button
              variant="secondary"
              disabled={run.kind !== 'failed' || readiness.kind !== 'ready'}
              onClick={onOrganize}
            >
              Refazer
            </Button>
            <Button disabled>{insertLabels[format]}</Button>
          </PanelHeader>
          {run.kind === 'running' && <Running readiness={readiness} />}
          {run.kind === 'failed' && <Failure failure={run.failure} onRetry={onOrganize} />}
          {run.kind === 'idle' && <Waiting readiness={readiness} format={format} />}
        </>
      )}
    </section>
  );
}

function PanelHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className={sectionLabel}>A IA entendeu assim</h2>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}

function SettingsLink({ children }: { children: React.ReactNode }) {
  return (
    <Link
      to="/configuracoes"
      className="inline-flex h-10 items-center rounded-control border border-border px-4 text-sm font-medium text-text-strong transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-selection"
    >
      {children}
    </Link>
  );
}

/** Antes de organizar: o que falta (chave, escolha) ou o convite para apertar "Organizar". */
function Waiting({ readiness, format }: { readiness: Readiness; format: AiOrganizeFormat }) {
  let title = 'A IA organiza o que você falou aqui';
  let body = `Fale ou escreva à esquerda, escolha o formato e aperte “Organizar”. ${formatHints[format]}`;
  let action: React.ReactNode = null;
  switch (readiness.kind) {
    case 'loading':
      title = 'Vendo as suas escolhas de IA…';
      body = 'Só um instante.';
      break;
    case 'off':
      title = 'A IA ainda não está ligada neste ambiente';
      body = 'Preencha VITE_API_URL em apps/web/.env para o site falar com a API.';
      break;
    case 'error':
      title = 'Não deu para ver as suas escolhas de IA';
      body = readiness.message;
      break;
    case 'no-settings':
      title = 'Escolha a IA que vai organizar';
      body =
        'Em Configurações → IA você escolhe o provedor (Claude, Gemini ou ChatGPT), o modelo e guarda a sua chave. O uso é cobrado pelo provedor, na sua conta.';
      action = <SettingsLink>Abrir Configurações</SettingsLink>;
      break;
    case 'no-key':
      title = `Falta a chave do ${providerShortName[readiness.settings.provider]}`;
      body =
        'Guarde a sua chave em Configurações → IA. Ela fica cifrada no servidor e nunca volta para o navegador.';
      action = <SettingsLink>Guardar a chave</SettingsLink>;
      break;
    case 'ready':
      break;
  }
  return (
    <div className="mx-auto mt-8 flex max-w-md flex-col items-center gap-4 text-center">
      <div>
        <p className="text-base font-semibold text-text-strong">{title}</p>
        <p className="mt-2 text-[13px] leading-relaxed text-text-muted">{body}</p>
      </div>
      {action}
    </div>
  );
}

function Running({ readiness }: { readiness: Readiness }) {
  const who = readiness.kind === 'ready' ? providerShortName[readiness.settings.provider] : 'a IA';
  return (
    <div
      role="status"
      className="mx-auto mt-8 flex max-w-md flex-col items-center gap-3 text-center"
    >
      <Spinner />
      <p className="text-base font-semibold text-text-strong">Organizando com {who}…</p>
      <p className="text-[13px] leading-relaxed text-text-muted">
        Costuma levar de alguns segundos a um minuto, conforme o texto e o esforço escolhido.
      </p>
    </div>
  );
}

function Failure({ failure, onRetry }: { failure: OrganizeFailure; onRetry: () => void }) {
  return (
    <div className="mx-auto mt-8 flex w-full max-w-md flex-col items-start gap-4">
      <Alert tone="error" className="w-full">
        {failure.message}
      </Alert>
      <div className="flex flex-wrap gap-2">
        {needsSettings(failure.code) && <SettingsLink>Abrir Configurações</SettingsLink>}
        {canRetry(failure.code) && (
          <Button variant="secondary" onClick={onRetry}>
            Tentar de novo
          </Button>
        )}
      </div>
    </div>
  );
}

type Insert =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'failed'; message: string }
  | { kind: 'copied' }
  | { kind: 'copy-failed' }
  | { kind: 'script-created'; title: string };

function ResultView({
  response,
  projectId,
  stale,
  onRedo,
  redoDisabled,
}: {
  response: AiOrganizeResponse;
  projectId: string;
  stale: boolean;
  onRedo: () => void;
  redoDisabled: boolean;
}) {
  const { projects } = useServices();
  const navigate = useNavigate();
  const [insert, setInsert] = useState<Insert>({ kind: 'idle' });

  // Uma conversão só por resultado: o que se vê é exatamente o que vai para o quadro.
  const converted = useMemo<
    | { kind: 'flow'; flow: FlowContent }
    | { kind: 'script'; script: ScriptContent }
    | { kind: 'prompt'; text: string }
  >(() => {
    switch (response.format) {
      case 'flow':
      case 'plan':
        return { kind: 'flow', flow: aiOutputToFlow(response.output) };
      case 'script':
        return { kind: 'script', script: aiOutputToScript(response.output) };
      case 'prompt':
        return { kind: 'prompt', text: promptOutputToText(response.output) };
    }
  }, [response]);

  const saving = insert.kind === 'saving';

  const run = async () => {
    setInsert({ kind: 'saving' });
    try {
      if (converted.kind === 'prompt') {
        setInsert({ kind: (await copyText(converted.text)) ? 'copied' : 'copy-failed' });
        return;
      }
      if (!projects) throw new Error('A API de projetos não está ligada neste ambiente.');
      if (converted.kind === 'flow') {
        await insertFlowIntoProject(projects, projectId, converted.flow, response.output.title);
        await navigate({ to: '/p/$projectId', params: { projectId } });
        return;
      }
      const created = await createScriptProject(projects, converted.script, response.output.title);
      setInsert({ kind: 'script-created', title: created.title });
    } catch (error) {
      setInsert({
        kind: 'failed',
        message:
          error instanceof Error && error.message
            ? error.message
            : 'Não deu para guardar. Tente de novo.',
      });
    }
  };

  const created = insert.kind === 'script-created';
  return (
    <>
      <PanelHeader>
        <Button variant="secondary" disabled={redoDisabled || saving} onClick={onRedo}>
          Refazer
        </Button>
        <Button loading={saving} disabled={created} onClick={() => void run()}>
          {insertLabels[response.format]}
        </Button>
      </PanelHeader>

      <div className="flex flex-col gap-4" aria-live="polite">
        {stale && (
          <Alert tone="info">
            O texto ou o formato mudou depois desta organização. Aperte “Organizar” de novo para
            atualizar.
          </Alert>
        )}
        {insert.kind === 'failed' && <Alert tone="error">{insert.message}</Alert>}
        {insert.kind === 'copied' && <Alert tone="success">Prompt copiado.</Alert>}
        {insert.kind === 'copy-failed' && (
          <Alert tone="error">
            Não deu para copiar. Selecione o texto aqui ao lado e use Ctrl+C.
          </Alert>
        )}
        {insert.kind === 'script-created' && (
          <Alert tone="success">
            <span>
              Roteiro “{insert.title}” criado, com{' '}
              {converted.kind === 'script' ? converted.script.scenes.length : 0} cenas. Ele já está
              na sua lista, no{' '}
              <Link to="/" className="underline underline-offset-4">
                Início
              </Link>
              . O editor de roteiros chega numa próxima etapa.
            </span>
          </Alert>
        )}
      </div>

      <div data-testid="result" className="flex flex-col gap-4">
        <ResultTitle title={response.output.title} format={response.format} />
        {converted.kind === 'flow' && <FlowPreview flow={converted.flow} />}
        {converted.kind === 'script' && <ScriptPreview script={converted.script} />}
        {converted.kind === 'prompt' && response.format === 'prompt' && (
          <PromptPreview sections={response.output.sections} />
        )}
      </div>

      <Corrections corrections={response.output.corrections} />
      <p className="text-xs text-text-muted">
        {providerShortName[response.provider]} · {response.model} · {response.usage.inputTokens}{' '}
        tokens enviados e {response.usage.outputTokens} de resposta.
      </p>
    </>
  );
}

function ResultTitle({ title, format }: { title: string; format: AiOrganizeFormat }) {
  return (
    <p className="text-sm text-text-muted">
      <span className="font-semibold text-text-strong">{title}</span>
      {format === 'plan' && ' · plano com tarefas'}
    </p>
  );
}

function PromptPreview({ sections }: { sections: { heading: string; content: string }[] }) {
  return (
    <div className="flex flex-col gap-4 rounded-block border border-border bg-surface p-5 text-left">
      {sections.map((section) => (
        <div key={section.heading}>
          <h3 className="text-xs font-semibold tracking-wider text-text-muted uppercase">
            {section.heading}
          </h3>
          <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap text-text">
            {section.content}
          </p>
        </div>
      ))}
    </div>
  );
}

/** "Correção percebida: você trocou “raposa” por “gato”." (a faixa amarela da tela 5). */
function Corrections({ corrections }: { corrections: AiCorrection[] }) {
  if (corrections.length === 0) return null;
  return (
    <section
      aria-label="Correções que a IA percebeu"
      className="rounded-control bg-note-yellow-bg px-4 py-3 text-sm text-note-yellow-fg"
    >
      <h3 className="text-[13px] font-semibold">Correções que a IA percebeu</h3>
      <ul className="mt-1 flex flex-col gap-0.5">
        {corrections.map((correction, index) => (
          <li key={index}>
            Você trocou “{correction.from}” por “{correction.to}”. Ficou “{correction.to}”.
          </li>
        ))}
      </ul>
    </section>
  );
}

import { Link } from '@tanstack/react-router';
import { Alert, Button, cn } from '@trama/ui';
import { VoiceIcon } from '@trama/ui/icons';
import { useEffect, useRef, useState } from 'react';
import { copyText } from './copy';
import { deviceNotice } from './device';
import { micErrorText } from './mic-errors';
import {
  DEFAULT_VOICE_MODEL,
  formatDownloadSize,
  isVoiceModelId,
  VOICE_MODELS,
  voiceModelList,
  type VoiceModelId,
} from './models';
import { MAX_RECORDING_SECONDS } from './recording-state';
import type { VoiceServices } from './services';
import { modelNotice, statusLines } from './status-text';
import { appendTranscript } from './text';
import { useComputeDevice, useVoiceSession } from './use-voice-session';
import { VoiceWaveform } from './VoiceWaveform';

/** Os formatos que a IA vai montar; ligados na próxima etapa. */
const FORMATS = ['Fluxo', 'Roteiro', 'Plano com tarefas', 'Prompt organizado'] as const;

const label = 'text-[13px] text-text-muted';
const sectionLabel = 'text-[13px] font-semibold tracking-wider text-text-muted uppercase';
const selectClass =
  'h-10 rounded-control border border-border bg-field px-3 text-sm text-text transition-colors hover:border-text-muted focus-visible:outline-2 focus-visible:outline-selection disabled:cursor-not-allowed disabled:opacity-60';

/**
 * "Falar e organizar" (tela 5). Esta etapa traz a metade da esquerda funcionando: gravar,
 * transcrever no navegador, corrigir à mão e copiar. A metade da direita (a IA organizando o
 * texto) e a escolha do formato ficam no lugar, desligadas, até a etapa da organização.
 */
export function VoiceWorkspace({
  projectId,
  projectTitle,
  services,
}: {
  projectId: string;
  projectTitle: string;
  services: VoiceServices;
}) {
  const [text, setText] = useState('');
  const [modelId, setModelId] = useState<VoiceModelId>(DEFAULT_VOICE_MODEL);
  const device = useComputeDevice(services);
  const { session, state } = useVoiceSession({
    services,
    model: modelId,
    device,
    onText: (chunk) => setText((current) => appendTranscript(current, chunk)),
  });

  const recording = state.phase === 'recording';
  const busy = state.phase !== 'idle';
  const lines = statusLines(state, text.trim() !== '');
  const model = modelNotice(state.model);
  const slow = device ? deviceNotice(device) : null;

  return (
    <div className="flex min-h-dvh flex-col bg-page">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-border-subtle px-6 py-2 sm:h-14 sm:py-0">
        <div className="flex min-w-0 items-center gap-3 text-[15px]">
          <Link
            to="/p/$projectId"
            params={{ projectId }}
            className="truncate rounded-tag text-text-muted transition-colors hover:text-text-strong focus-visible:outline-2 focus-visible:outline-selection"
          >
            {projectTitle}
          </Link>
          <span className="text-text-muted" aria-hidden>
            /
          </span>
          <h1 className="font-normal whitespace-nowrap text-text-strong">Falar e organizar</h1>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <label className="flex items-center gap-3">
            <span className={label}>Transcrição</span>
            <select
              value={modelId}
              disabled={busy}
              onChange={(event) =>
                isVoiceModelId(event.target.value) && setModelId(event.target.value)
              }
              className={selectClass}
            >
              {voiceModelList.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label
            className="flex items-center gap-3"
            title="A organização pela IA chega na próxima etapa"
          >
            <span className={label}>Organizar com</span>
            <select disabled className={selectClass}>
              <option>Claude</option>
            </select>
          </label>
        </div>
      </header>

      <main className="grid flex-1 grid-cols-1 gap-6 p-6 lg:grid-cols-[minmax(0,6fr)_minmax(0,7fr)]">
        <section
          aria-label="Gravação e transcrição"
          className="flex min-h-[560px] flex-col gap-6 rounded-block border border-border bg-surface p-6"
        >
          <div className="flex items-center gap-4">
            <button
              type="button"
              disabled={!session || state.phase === 'starting' || state.phase === 'finishing'}
              aria-label={recording ? 'Parar de gravar' : 'Gravar'}
              onClick={() => void (recording ? session?.stop() : session?.start())}
              className="flex size-14 shrink-0 items-center justify-center rounded-full bg-brand-paper text-brand-ink transition-colors hover:bg-text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-selection disabled:cursor-not-allowed disabled:opacity-60"
            >
              {recording ? (
                <span aria-hidden className="size-4 rounded-tag bg-recording" />
              ) : (
                <VoiceIcon size={22} aria-hidden />
              )}
            </button>
            <div role="status" aria-live="polite" className="min-w-0">
              <p className="text-base font-semibold text-text-strong">{lines.title}</p>
              <p className="text-[13px] text-text-muted">{lines.hint}</p>
            </div>
          </div>

          <VoiceWaveform levels={state.levels} active={recording} />

          <div className="flex flex-col gap-3 empty:hidden">
            {state.micError && (
              <Alert tone={state.micError === 'lost' ? 'info' : 'error'}>
                {micErrorText[state.micError]}
              </Alert>
            )}
            {model && (
              <div className="flex flex-col gap-2">
                <Alert tone={state.model.status === 'failed' ? 'error' : 'info'}>
                  <span>{model}</span>
                  {state.model.status === 'failed' && (
                    <span className="mt-2 flex gap-2">
                      <Button variant="secondary" onClick={() => session?.retryModel()}>
                        Tentar de novo
                      </Button>
                      {state.phase === 'finishing' && (
                        <Button variant="ghost" onClick={() => session?.discard()}>
                          Descartar o que falta
                        </Button>
                      )}
                    </span>
                  )}
                </Alert>
                {state.model.status === 'loading' && state.model.percent !== null && (
                  <progress
                    value={state.model.percent}
                    max={100}
                    aria-label="Download do modelo de voz"
                    className="h-1 w-full overflow-hidden rounded-full bg-hover accent-selection"
                  />
                )}
              </div>
            )}
            {slow && !state.micError && <Alert tone="info">{slow}</Alert>}
            {state.failedChunks > 0 && (
              <Alert tone="error">
                {state.failedChunks === 1
                  ? 'Um trecho não foi transcrito. Fale de novo essa parte.'
                  : `${state.failedChunks} trechos não foram transcritos. Fale de novo essas partes.`}
              </Alert>
            )}
            {state.limitReached && (
              <Alert tone="info">
                Chegamos aos {MAX_RECORDING_SECONDS / 60} minutos, o limite de uma gravação. Aperte
                o microfone para continuar: o que você falar entra no fim do texto.
              </Alert>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 id="transcricao" className={sectionLabel}>
                Transcrição (do jeito que foi falado)
              </h2>
              <CopyButton text={text} />
            </div>
            <textarea
              aria-labelledby="transcricao"
              value={text}
              onChange={(event) => setText(event.target.value)}
              spellCheck
              lang="pt-BR"
              placeholder="O que você falar aparece aqui, aos poucos. Dá para corrigir à mão."
              className="min-h-48 w-full flex-1 resize-none rounded-control border border-transparent bg-transparent p-0 text-[15px] leading-relaxed text-text placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-selection"
            />
            <p className="text-xs text-text-muted">
              O modelo de voz (
              {formatDownloadSize(VOICE_MODELS[modelId].downloadMb[device ?? 'wasm'])}) baixa só na
              primeira vez e fica guardado no navegador. O áudio não sai do seu computador.
            </p>
          </div>

          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Organizar como"
          >
            <span className={label}>Organizar como:</span>
            {FORMATS.map((format, index) => (
              <button
                key={format}
                type="button"
                disabled
                aria-pressed={index === 0}
                title="A organização pela IA chega na próxima etapa"
                className={cn(
                  'h-10 cursor-not-allowed rounded-control border px-3 text-sm opacity-60',
                  index === 0
                    ? 'border-brand-paper bg-brand-paper font-semibold text-brand-ink'
                    : 'border-border text-text',
                )}
              >
                {format}
              </button>
            ))}
          </div>
        </section>

        <section
          aria-label="O que a IA entendeu"
          className="bg-canvas-dots flex min-h-[320px] flex-col gap-6 rounded-block border border-border p-6"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className={sectionLabel}>A IA entendeu assim</h2>
            <div className="flex gap-2">
              <Button variant="secondary" disabled>
                Refazer
              </Button>
              <Button disabled>Inserir no quadro</Button>
            </div>
          </div>
          <div className="mx-auto mt-8 max-w-md text-center">
            <p className="text-base font-semibold text-text-strong">
              A organização pela IA chega na próxima etapa
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-text-muted">
              Por enquanto o Trama grava a sua fala e escreve o texto aqui ao lado, no seu
              computador. Corrija o que precisar e use &ldquo;Copiar texto&rdquo;. Depois, a IA vai
              transformar esse texto em fluxo, roteiro, plano ou prompt, e você poderá inserir no
              quadro.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    setState((await copyText(text)) ? 'copied' : 'failed');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2_500);
  };

  return (
    <span className="flex items-center gap-3">
      <span role="status" aria-live="polite" className="text-[13px] text-text-muted">
        {state === 'copied' && 'Copiado'}
        {state === 'failed' && 'Não deu para copiar: selecione o texto e use Ctrl+C.'}
      </span>
      <Button variant="secondary" disabled={text.trim() === ''} onClick={() => void copy()}>
        Copiar texto
      </Button>
    </span>
  );
}

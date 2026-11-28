import {
  AI_MODEL_SUGGESTIONS,
  aiEffortHints,
  aiEffortLabels,
  aiEffortSchema,
  aiProviderLabels,
  aiProviderSchema,
  DEFAULT_AI_EFFORT,
  type AiEffort,
  type AiKeySummary,
  type AiModel,
  type AiProvider,
  type AiSettings,
} from '@trama/core';
import { Alert, Button, cn, PasswordField, Spinner } from '@trama/ui';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { AiApi } from '../../api/ai-api';
import { ApiError } from '../../api/http';
import { GENERIC_ERROR } from '../../auth/errors';
import { SavedNote, Section } from './Section';

const DESCRIPTION =
  'Escolha o provedor, o modelo e o esforço. A chave é sua: fica cifrada no servidor e o uso é cobrado pelo provedor, na sua conta.';

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : GENERIC_ERROR;
}

type Load =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; settings: AiSettings | null; keys: AiKeySummary[] };

/** IA (etapa 3.1): provedor, chave, modelo e esforço. Cada escolha salva na hora. */
export function AiSection({ api }: { api: AiApi }) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  // Mesmo cuidado do resto de Configurações: o estado já nasce "carregando", e o botão de
  // tentar de novo o recoloca antes de subir `attempt`.
  useEffect(() => {
    let alive = true;
    Promise.all([api.getSettings(), api.listKeys()]).then(
      ([settings, keys]) => alive && setLoad({ kind: 'ready', settings, keys }),
      (error: unknown) => alive && setLoad({ kind: 'error', message: messageOf(error) }),
    );
    return () => {
      alive = false;
    };
  }, [api, attempt]);

  return (
    <Section title="IA" description={DESCRIPTION}>
      {load.kind === 'loading' && (
        <p role="status" className="flex items-center gap-2.5 text-text-muted">
          <Spinner /> Carregando…
        </p>
      )}
      {load.kind === 'error' && (
        <div className="flex flex-col items-start gap-4">
          <Alert tone="error">{load.message}</Alert>
          <Button
            variant="secondary"
            onClick={() => {
              setLoad({ kind: 'loading' });
              setAttempt((n) => n + 1);
            }}
          >
            Tentar de novo
          </Button>
        </div>
      )}
      {load.kind === 'ready' && (
        <AiForm api={api} initialSettings={load.settings} initialKeys={load.keys} />
      )}
    </Section>
  );
}

interface AiFormProps {
  api: AiApi;
  initialSettings: AiSettings | null;
  initialKeys: AiKeySummary[];
}

function AiForm({ api, initialSettings, initialKeys }: AiFormProps) {
  const [saved, setSaved] = useState<AiSettings | null>(initialSettings);
  const [provider, setProvider] = useState<AiProvider>(initialSettings?.provider ?? 'anthropic');
  const [model, setModel] = useState(initialSettings?.model ?? '');
  const [effort, setEffort] = useState<AiEffort>(initialSettings?.effort ?? DEFAULT_AI_EFFORT);
  // O modelo padrão chega quando a lista termina de carregar; ele salva com o esforço de agora.
  const effortNow = useRef(effort);
  const [keys, setKeys] = useState(initialKeys);
  const [note, setNote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelsAttempt, setModelsAttempt] = useState(0);

  const key = keys.find((item) => item.provider === provider);

  async function persist(next: AiSettings) {
    setNote(false);
    setError(null);
    try {
      setSaved(await api.saveSettings(next));
      setNote(true);
    } catch (failure) {
      setError(messageOf(failure));
    }
  }

  function chooseProvider(next: AiProvider) {
    if (next === provider) return;
    setProvider(next);
    // O modelo é de cada provedor: volta o que estava salvo para ele, ou espera a lista.
    setModel(saved?.provider === next ? saved.model : '');
    setNote(false);
    setError(null);
  }

  function chooseModel(id: string) {
    setModel(id);
    void persist({ provider, model: id, effort: effortNow.current });
  }

  function chooseEffort(next: AiEffort) {
    setEffort(next);
    effortNow.current = next;
    if (model) void persist({ provider, model, effort: next });
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <Alert tone="error">{error}</Alert>}

      <ProviderChoice provider={provider} keys={keys} onChoose={chooseProvider} />

      <KeyField
        key={provider}
        api={api}
        provider={provider}
        summary={key}
        onSaved={(summary) => {
          setKeys((current) => [...current.filter((k) => k.provider !== provider), summary]);
          // Chave nova pode mudar a lista de modelos: carrega de novo.
          setModelsAttempt((n) => n + 1);
        }}
        onDeleted={() => setKeys((current) => current.filter((k) => k.provider !== provider))}
      />

      {key ? (
        <ModelPicker
          key={`${provider}:${key.savedAt}:${String(modelsAttempt)}`}
          api={api}
          provider={provider}
          model={model}
          onChoose={chooseModel}
          onRetry={() => setModelsAttempt((n) => n + 1)}
        />
      ) : (
        <ModelPlaceholder />
      )}

      <EffortChoice effort={effort} onChoose={chooseEffort} />

      <div className="h-5">
        <SavedNote show={note} />
      </div>
    </div>
  );
}

function ProviderChoice(props: {
  provider: AiProvider;
  keys: AiKeySummary[];
  onChoose: (provider: AiProvider) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="text-[13px] font-medium text-text">Provedor</legend>
      <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
        {aiProviderSchema.options.map((option) => {
          const checked = option === props.provider;
          const hasKey = props.keys.some((k) => k.provider === option);
          return (
            <label
              key={option}
              className={cn(
                'flex cursor-pointer flex-col gap-0.5 rounded-control border px-3 py-2.5 transition-colors',
                'focus-within:outline-2 focus-within:outline-selection',
                checked ? 'border-text-strong bg-hover' : 'border-border hover:bg-hover',
              )}
            >
              <input
                type="radio"
                name="ai-provider"
                value={option}
                checked={checked}
                onChange={() => props.onChoose(option)}
                className="sr-only"
              />
              <span className="text-sm font-medium text-text-strong">
                {aiProviderLabels[option]}
              </span>
              <span className={cn('text-xs', hasKey ? 'text-done-text' : 'text-text-muted')}>
                {hasKey ? 'Chave guardada' : 'Sem chave'}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

interface KeyFieldProps {
  api: AiApi;
  provider: AiProvider;
  summary: AiKeySummary | undefined;
  onSaved: (summary: AiKeySummary) => void;
  onDeleted: () => void;
}

/** A chave: campo de senha; depois de guardada, só "termina em 1234", com Trocar e Apagar. */
function KeyField({ api, provider, summary, onSaved, onDeleted }: KeyFieldProps) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<{ message: string; rejected: boolean } | null>(null);
  const [field, setField] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const raw = new FormData(form).get('apiKey');
    const apiKey = typeof raw === 'string' ? raw.trim() : '';
    if (!apiKey) {
      setField('Cole a chave do provedor.');
      return;
    }
    setField(null);
    setError(null);
    setBusy(true);
    try {
      onSaved(await api.saveKey(provider, apiKey));
      form.reset();
      setEditing(false);
    } catch (failure) {
      const rejected = failure instanceof ApiError && failure.code === 'key_rejected';
      setError({ message: messageOf(failure), rejected });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setError(null);
    setBusy(true);
    try {
      await api.deleteKey(provider);
      setConfirming(false);
      onDeleted();
    } catch (failure) {
      setError({ message: messageOf(failure), rejected: false });
    } finally {
      setBusy(false);
    }
  }

  const showForm = !summary || editing;

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <Alert tone="error" title={error.rejected ? 'Chave recusada pelo provedor' : undefined}>
          {error.message}
        </Alert>
      )}
      {showForm ? (
        <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-3">
          <PasswordField
            label="Chave da API"
            name="apiKey"
            autoComplete="off"
            spellCheck={false}
            error={field}
            hint={`Cole a chave da sua conta ${aiProviderLabels[provider]}. Ela é testada antes de ser guardada.`}
          />
          <div className="flex items-center gap-3">
            <Button type="submit" loading={busy}>
              Guardar chave
            </Button>
            {summary && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setEditing(false);
                  setError(null);
                  setField(null);
                }}
              >
                Cancelar
              </Button>
            )}
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-medium text-text">Chave da API</p>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-text-strong">
              Chave guardada, termina em <span className="font-mono">{summary.last4}</span>
            </p>
            {confirming ? (
              <>
                <span className="text-sm text-text-muted">Apagar esta chave?</span>
                <Button variant="secondary" loading={busy} onClick={() => void remove()}>
                  Sim, apagar
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
                  Cancelar
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  Trocar
                </Button>
                <Button variant="ghost" onClick={() => setConfirming(true)}>
                  Apagar
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const SELECT_CLASS =
  'h-11 w-full max-w-sm rounded-control border border-border bg-field px-3 text-sm text-text-strong focus-visible:outline-2 focus-visible:outline-selection disabled:opacity-60';

function ModelPlaceholder() {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-text">
        Modelo
      </label>
      <select id={id} disabled className={SELECT_CLASS}>
        <option>Guarde a chave para ver os modelos</option>
      </select>
    </div>
  );
}

type ModelsLoad =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; rejected: boolean }
  | { kind: 'ready'; models: AiModel[] };

interface ModelPickerProps {
  api: AiApi;
  provider: AiProvider;
  model: string;
  onChoose: (id: string) => void;
  onRetry: () => void;
}

/** O nome do modelo na lista, com a sugestão do Trama quando há ("para o dia a dia"). */
function labelOf(provider: AiProvider, model: AiModel): string {
  const hint = AI_MODEL_SUGGESTIONS[provider]?.find((item) => item.id === model.id)?.hint;
  return hint ? `${model.name} · ${hint}` : model.name;
}

/** Sem modelo escolhido, a sugestão do Trama que a conta tem (ou o primeiro da lista). */
function defaultModel(provider: AiProvider, models: AiModel[]): string | undefined {
  const suggested = AI_MODEL_SUGGESTIONS[provider]?.find((item) =>
    models.some((m) => m.id === item.id),
  );
  return suggested?.id ?? models[0]?.id;
}

/** A lista de modelos vem da API do provedor, com a chave da pessoa: modelo novo aparece sozinho. */
function ModelPicker({ api, provider, model, onChoose, onRetry }: ModelPickerProps) {
  const id = useId();
  const [load, setLoad] = useState<ModelsLoad>({ kind: 'loading' });

  // Carrega ao montar; trocar de provedor ou de chave remonta (veja a `key` no AiForm).
  useEffect(() => {
    let alive = true;
    api.listModels(provider).then(
      (models) => {
        if (!alive) return;
        setLoad({ kind: 'ready', models });
        const first = model ? undefined : defaultModel(provider, models);
        if (first) onChoose(first);
      },
      (failure: unknown) => {
        if (!alive) return;
        setLoad({
          kind: 'error',
          message: messageOf(failure),
          rejected: failure instanceof ApiError && failure.code === 'key_rejected',
        });
      },
    );
    return () => {
      alive = false;
    };
    // Só ao montar: a lista não muda quando a pessoa escolhe um modelo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (load.kind === 'loading') {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-text">Modelo</span>
        <p role="status" className="flex items-center gap-2.5 text-sm text-text-muted">
          <Spinner /> Carregando os modelos…
        </p>
      </div>
    );
  }

  if (load.kind === 'error') {
    return (
      <div className="flex flex-col items-start gap-3">
        <span className="text-[13px] font-medium text-text">Modelo</span>
        <Alert tone="error" title={load.rejected ? 'Chave recusada pelo provedor' : undefined}>
          {load.message}
          {load.rejected && ' Troque a chave acima.'}
        </Alert>
        <Button variant="secondary" onClick={onRetry}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  const known = load.models.some((m) => m.id === model);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-text">
        Modelo
      </label>
      <select
        id={id}
        value={model}
        onChange={(event) => onChoose(event.target.value)}
        className={SELECT_CLASS}
      >
        {!model && (
          <option value="" disabled>
            Escolha um modelo
          </option>
        )}
        {model && !known && <option value={model}>{model} (fora da lista da sua conta)</option>}
        {load.models.map((item) => (
          <option key={item.id} value={item.id}>
            {labelOf(provider, item)}
          </option>
        ))}
      </select>
      <p className="text-xs text-text-muted">A lista vem direto do provedor, da sua conta.</p>
    </div>
  );
}

function EffortChoice(props: { effort: AiEffort; onChoose: (effort: AiEffort) => void }) {
  return (
    <fieldset className="min-w-0">
      <legend className="text-[13px] font-medium text-text">Esforço</legend>
      <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
        {aiEffortSchema.options.map((option) => {
          const checked = option === props.effort;
          return (
            <label
              key={option}
              className={cn(
                'flex cursor-pointer items-center justify-center rounded-control border px-3 py-2.5 text-sm font-medium transition-colors',
                'focus-within:outline-2 focus-within:outline-selection',
                checked
                  ? 'border-text-strong bg-hover text-text-strong'
                  : 'border-border text-text hover:bg-hover',
              )}
            >
              <input
                type="radio"
                name="ai-effort"
                value={option}
                checked={checked}
                onChange={() => props.onChoose(option)}
                className="sr-only"
              />
              {aiEffortLabels[option]}
            </label>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-text-muted">{aiEffortHints[props.effort]}</p>
    </fieldset>
  );
}

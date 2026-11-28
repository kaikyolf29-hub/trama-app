import {
  noteColorSchema,
  notebookDescriptionSchema,
  projectTitleSchema,
  reviewAfterDaysSchema,
  type NoteColor,
} from '@trama/core';
import { Alert, Button, cn, TextField } from '@trama/ui';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { notebookColorClasses, notebookColorLabels } from './format';

const FOCUSABLE = 'input, button:not([disabled]), textarea, select, [href]';

export interface NotebookForm {
  title: string;
  description: string;
  color: NoteColor;
  reviewAfterDays: number;
}

/**
 * Janela de "Novo caderno" e de "Editar caderno": nome, descrição, cor do cartão e de quantos em
 * quantos dias a aula volta para revisão.
 */
export function NotebookDialog({
  heading,
  submitLabel,
  initial,
  onSave,
  onClose,
}: {
  heading: string;
  submitLabel: string;
  initial: NotebookForm;
  /** Grava; rejeita com a mensagem da API se não der. */
  onSave: (form: NotebookForm) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [color, setColor] = useState<NoteColor>(initial.color);
  const [days, setDays] = useState(String(initial.reviewAfterDays));
  const [errors, setErrors] = useState<{ title?: string; days?: string; description?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const panel = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Tab fica dentro da janela enquanto ela está aberta.
  const keepFocusInside = (event: KeyboardEvent) => {
    if (event.key !== 'Tab' || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const parsedTitle = projectTitleSchema.safeParse(title);
    const parsedDescription = notebookDescriptionSchema.safeParse(description);
    const parsedDays = reviewAfterDaysSchema.safeParse(Number(days));
    const parsedColor = noteColorSchema.parse(color);
    const next: typeof errors = {};
    if (!parsedTitle.success) next.title = 'Dê um nome ao caderno (até 200 letras).';
    if (!parsedDescription.success) next.description = 'Use no máximo 2.000 letras.';
    if (days.trim() === '' || !parsedDays.success) {
      next.days = 'Escolha de 1 a 365 dias.';
    }
    setErrors(next);
    setFailure(null);
    if (!parsedTitle.success || !parsedDescription.success || !parsedDays.success) return;

    setSaving(true);
    try {
      await onSave({
        title: parsedTitle.data,
        description: parsedDescription.data,
        color: parsedColor,
        reviewAfterDays: parsedDays.data,
      });
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Não deu para salvar o caderno.');
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-canvas/70 p-4 sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="caderno-titulo"
        noValidate
        onSubmit={(event) => void submit(event)}
        onKeyDown={keepFocusInside}
        className="flex max-h-full w-full max-w-md flex-col gap-4 overflow-y-auto rounded-block border border-border bg-floating p-6 shadow-floating"
      >
        <h2 id="caderno-titulo" className="text-lg font-semibold text-text-strong">
          {heading}
        </h2>

        {failure && <Alert tone="error">{failure}</Alert>}

        <TextField
          label="Nome"
          value={title}
          maxLength={200}
          autoFocus
          autoComplete="off"
          error={errors.title ?? null}
          onChange={(event) => setTitle(event.target.value)}
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="caderno-descricao" className="text-[13px] font-medium text-text">
            Descrição (opcional)
          </label>
          <textarea
            id="caderno-descricao"
            value={description}
            maxLength={2000}
            rows={3}
            aria-invalid={errors.description ? true : undefined}
            onChange={(event) => setDescription(event.target.value)}
            className="resize-y rounded-control border border-border bg-field px-3 py-2 text-sm text-text-strong outline-none focus-visible:border-selection focus-visible:outline-1 focus-visible:outline-selection"
          />
          {errors.description && (
            <p className="text-[13px] text-note-pink-fg">{errors.description}</p>
          )}
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-[13px] font-medium text-text">Cor do cartão</legend>
          <div className="flex gap-2">
            {noteColorSchema.options.map((option) => (
              <label key={option} className="cursor-pointer">
                <input
                  type="radio"
                  name="cor"
                  value={option}
                  checked={color === option}
                  onChange={() => setColor(option)}
                  className="peer sr-only"
                />
                <span
                  className={cn(
                    'flex h-9 items-center gap-2 rounded-control border border-border px-3 text-[13px] text-text transition-colors',
                    'peer-checked:border-text-strong peer-checked:text-text-strong peer-focus-visible:outline-2 peer-focus-visible:outline-selection',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn('size-3 rounded-full', notebookColorClasses[option].dot)}
                  />
                  {notebookColorLabels[option]}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <TextField
          label="Revisar depois de quantos dias"
          type="number"
          inputMode="numeric"
          min={1}
          max={365}
          value={days}
          hint="Depois de estudar ou revisar uma aula, ela volta para revisão neste prazo."
          error={errors.days ?? null}
          onChange={(event) => setDays(event.target.value)}
        />

        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}

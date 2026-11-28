import {
  isFutureNote,
  localTime,
  todayKey,
  zonedInstant,
  type CreateNoteRequest,
} from '@trama/core';
import { Alert, Button, TextField } from '@trama/ui';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

const FOCUSABLE = 'input, button:not([disabled]), textarea, select, [href]';

/**
 * "Registrar algo": uma anotação feita à mão na Agenda. Dia e hora começam em "agora"; dá para
 * escolher um momento do passado (nunca do futuro). Se a pessoa não mexer em dia e hora, a
 * API grava a hora exata do envio.
 */
export function NoteDialog({
  now,
  timeZone,
  onSave,
  onClose,
}: {
  now: () => Date;
  timeZone: string;
  /** Grava a anotação; rejeita com a mensagem da API se não der. */
  onSave: (input: CreateNoteRequest) => Promise<void>;
  onClose: () => void;
}) {
  // O "agora" do formulário fica fixo enquanto ele está aberto.
  const [opened] = useState(() => now());
  const initialDay = todayKey(opened, timeZone);
  const initialTime = localTime(opened, timeZone);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [day, setDay] = useState(initialDay);
  const [time, setTime] = useState(initialTime);
  const [errors, setErrors] = useState<{ title?: string; when?: string }>({});
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
    const next: { title?: string; when?: string } = {};
    if (title.trim() === '') next.title = 'Escreva o que aconteceu.';

    const touched = day !== initialDay || time !== initialTime;
    let occurredAt: string | undefined;
    if (touched) {
      const [hour, minute] = time.split(':').map(Number);
      if (!day || hour === undefined || minute === undefined || Number.isNaN(hour * minute)) {
        next.when = 'Escolha o dia e a hora.';
      } else {
        occurredAt = zonedInstant(day, hour, minute, timeZone).toISOString();
        if (isFutureNote(occurredAt, now())) next.when = 'Escolha um momento que já passou.';
      }
    }
    setErrors(next);
    setFailure(null);
    if (next.title || next.when) return;

    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        ...(detail.trim() ? { detail: detail.trim() } : {}),
        ...(occurredAt ? { occurredAt } : {}),
      });
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Não deu para salvar a anotação.');
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
        aria-labelledby="registrar-titulo"
        noValidate
        onSubmit={(event) => void submit(event)}
        onKeyDown={keepFocusInside}
        className="flex max-h-full w-full max-w-md flex-col gap-4 overflow-y-auto rounded-block border border-border bg-floating p-6 shadow-floating"
      >
        <div>
          <h2 id="registrar-titulo" className="text-lg font-semibold text-text-strong">
            Registrar algo
          </h2>
          <p className="text-[13px] text-text-muted">
            Anote o que você fez. A hora é de agora, a não ser que você escolha outra.
          </p>
        </div>

        {failure && <Alert tone="error">{failure}</Alert>}

        <TextField
          label="O que aconteceu"
          value={title}
          maxLength={200}
          autoFocus
          autoComplete="off"
          error={errors.title ?? null}
          onChange={(event) => setTitle(event.target.value)}
        />
        <TextField
          label="Detalhe (opcional)"
          value={detail}
          maxLength={500}
          autoComplete="off"
          onChange={(event) => setDetail(event.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Dia"
            type="date"
            value={day}
            max={initialDay}
            onChange={(event) => setDay(event.target.value)}
          />
          <TextField
            label="Hora"
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
          />
        </div>
        {errors.when && (
          <p role="alert" className="-mt-2 text-[13px] text-note-pink-fg">
            {errors.when}
          </p>
        )}

        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving}>
            Registrar
          </Button>
        </div>
      </form>
    </div>
  );
}

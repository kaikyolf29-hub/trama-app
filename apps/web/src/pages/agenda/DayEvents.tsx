import { Link } from '@tanstack/react-router';
import { canDeleteEvent, localTime, type AgendaEvent } from '@trama/core';
import { Button, cn } from '@trama/ui';
import { TrashIcon } from '@trama/ui/icons';
import { useState } from 'react';
import { eventHeadline, eventStyles, eventSubline, openableProjectId } from './event-style';

const iconButton =
  'inline-flex size-8 shrink-0 items-center justify-center rounded-control text-text-muted transition-colors hover:bg-hover hover:text-text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-selection disabled:cursor-not-allowed disabled:opacity-60';

/**
 * A lista de um dia (a coluna da direita da tela 7): hora, ícone do tipo, o que aconteceu e o
 * projeto. Clicar num evento de fluxo abre o quadro; anotação à mão pode ser apagada.
 */
export function DayEvents({
  events,
  timeZone,
  emptyText,
  onRemove,
}: {
  events: AgendaEvent[];
  timeZone: string;
  emptyText: string;
  /** Apaga a anotação; rejeita com a mensagem da API se não der. */
  onRemove: (event: AgendaEvent) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (events.length === 0) return <p className="text-sm text-text-muted">{emptyText}</p>;

  const remove = async (event: AgendaEvent) => {
    setBusy(event.id);
    setError(null);
    try {
      await onRemove(event);
      setConfirming(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não deu para apagar a anotação.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-4">
        {events.map((event) => {
          const style = eventStyles[event.type];
          const Icon = style.icon;
          const projectId = openableProjectId(event);
          const subline = eventSubline(event);
          const body = (
            <>
              <span className="min-w-0 flex-1">
                <span className={cn('block text-[15px] leading-snug break-words', style.title)}>
                  {eventHeadline(event)}
                </span>
                {subline && (
                  <span className="block text-[13px] leading-snug break-words text-text-muted">
                    {subline}
                  </span>
                )}
              </span>
            </>
          );
          return (
            <li key={event.id} className="flex items-start gap-3">
              <time
                dateTime={event.occurredAt}
                className="w-12 shrink-0 pt-px text-[13px] text-text-muted tabular-nums"
              >
                {localTime(event.occurredAt, timeZone)}
              </time>
              <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', style.title)} />
              {projectId ? (
                <Link
                  to="/p/$projectId"
                  params={{ projectId }}
                  className="flex min-w-0 flex-1 rounded-tag hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-selection"
                >
                  {body}
                </Link>
              ) : (
                <div className="flex min-w-0 flex-1">{body}</div>
              )}
              {canDeleteEvent(event) &&
                (confirming === event.id ? (
                  <span className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="secondary"
                      loading={busy === event.id}
                      onClick={() => void remove(event)}
                    >
                      Apagar
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy === event.id}
                      onClick={() => setConfirming(null)}
                    >
                      Cancelar
                    </Button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className={iconButton}
                    aria-label={`Apagar a anotação "${event.title}"`}
                    onClick={() => {
                      setError(null);
                      setConfirming(event.id);
                    }}
                  >
                    <TrashIcon aria-hidden className="size-4" />
                  </button>
                ))}
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="text-[13px] text-note-pink-fg">
          {error}
        </p>
      )}
    </div>
  );
}

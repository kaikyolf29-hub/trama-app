import { Link } from '@tanstack/react-router';
import { monthGrid, parseDateKey, type AgendaEvent, type DateKey } from '@trama/core';
import { cn } from '@trama/ui';
import { ChevronLeftIcon, ChevronRightIcon } from '@trama/ui/icons';
import { longDate, monthTitle, WEEKDAYS_SHORT } from './dates';
import { eventHeadline, eventStyles, openableProjectId } from './event-style';

/** Quantas etiquetas cabem num dia antes do "+N". */
const MAX_CHIPS = 3;

const arrowButton =
  'inline-flex size-8 items-center justify-center rounded-control text-text-muted transition-colors hover:bg-hover hover:text-text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-selection';

/**
 * O mês da tela 7: semanas de domingo a sábado, o dia de hoje em azul, o dia escolhido
 * destacado e, em cada dia, etiquetas coloridas com o que aconteceu. Clicar numa etiqueta de
 * fluxo abre o quadro; clicar no resto do dia escolhe o dia.
 */
export function MonthCalendar({
  year,
  month,
  eventsByDay,
  selected,
  today,
  loading,
  empty,
  onSelect,
  onShiftMonth,
}: {
  year: number;
  month: number;
  eventsByDay: ReadonlyMap<DateKey, AgendaEvent[]>;
  selected: DateKey;
  today: DateKey;
  loading: boolean;
  /** O mês não tem nada registrado. */
  empty: boolean;
  onSelect: (key: DateKey) => void;
  onShiftMonth: (delta: number) => void;
}) {
  const weeks = monthGrid(year, month);

  return (
    <section aria-labelledby="mes-titulo" className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-3">
        <h2 id="mes-titulo" className="text-xl font-semibold text-text-strong">
          {monthTitle(month)} <span className="font-normal text-text-muted">{year}</span>
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={arrowButton}
            aria-label="Mês anterior"
            onClick={() => onShiftMonth(-1)}
          >
            <ChevronLeftIcon aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            className={arrowButton}
            aria-label="Próximo mês"
            onClick={() => onShiftMonth(1)}
          >
            <ChevronRightIcon aria-hidden className="size-4" />
          </button>
        </div>
        {!loading && empty && (
          <p className="text-[13px] text-text-muted">Nada registrado neste mês.</p>
        )}
      </div>

      <div className={cn('mt-4 overflow-x-auto transition-opacity', loading && 'opacity-60')}>
        <div
          role="grid"
          aria-label={`${monthTitle(month)} de ${year}`}
          className="sm:min-w-[560px]"
        >
          <div role="row" className="grid grid-cols-7">
            {WEEKDAYS_SHORT.map((weekday) => (
              <div
                key={weekday}
                role="columnheader"
                className="pb-2 text-xs font-medium tracking-wider text-text-muted uppercase"
              >
                {weekday}
              </div>
            ))}
          </div>
          <div className="border-t border-l border-border-subtle">
            {weeks.map((week) => (
              <div key={week[0]?.key} role="row" className="grid grid-cols-7">
                {week.map(({ key, inMonth }) => {
                  const events = inMonth ? (eventsByDay.get(key) ?? []) : [];
                  const isSelected = key === selected;
                  return (
                    <div
                      key={key}
                      role="gridcell"
                      aria-selected={isSelected}
                      onClick={() => inMonth && onSelect(key)}
                      className={cn(
                        'flex min-h-16 min-w-0 sm:min-h-28 flex-col gap-1 border-r border-b border-border-subtle p-1.5 sm:p-2',
                        inMonth && 'cursor-pointer hover:bg-hover/50',
                        isSelected && 'bg-hover',
                      )}
                    >
                      {inMonth ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onSelect(key);
                          }}
                          aria-label={`${longDate(key)}${events.length ? `: ${events.length} ${events.length === 1 ? 'registro' : 'registros'}` : ''}${key === today ? ' (hoje)' : ''}`}
                          aria-current={key === today ? 'date' : undefined}
                          className={cn(
                            'w-fit rounded-tag text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-selection',
                            key === today ? 'text-selection' : 'text-text-strong',
                          )}
                        >
                          {parseDateKey(key).day}
                        </button>
                      ) : (
                        <span aria-hidden className="text-sm text-text-muted/50">
                          {parseDateKey(key).day}
                        </span>
                      )}
                      {/* Em tela estreita, só pontinhos coloridos; o detalhe fica no painel do dia. */}
                      <div aria-hidden className="flex flex-wrap gap-1 sm:hidden">
                        {events.slice(0, 6).map((event) => (
                          <span
                            key={event.id}
                            className={cn('size-1.5 rounded-full', eventStyles[event.type].dot)}
                          />
                        ))}
                      </div>
                      <div className="hidden min-w-0 flex-col gap-1 sm:flex">
                        {events.slice(0, MAX_CHIPS).map((event) => (
                          <Chip key={event.id} event={event} />
                        ))}
                        {events.length > MAX_CHIPS && (
                          <span className="px-1.5 text-xs text-text-muted">
                            +{events.length - MAX_CHIPS} mais
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Chip({ event }: { event: AgendaEvent }) {
  const style = eventStyles[event.type];
  const Icon = style.icon;
  const text = event.title;
  const className = cn(
    'flex min-w-0 items-center gap-1 rounded-tag px-1.5 py-0.5 text-xs leading-snug',
    style.chip,
  );
  const content = (
    <>
      <Icon aria-hidden className="size-3 shrink-0" />
      <span className="truncate">{text}</span>
    </>
  );
  const label = `${eventHeadline(event)}: ${text}`;
  const projectId = openableProjectId(event);
  if (!projectId) {
    return (
      <span className={className} title={label}>
        {content}
      </span>
    );
  }
  return (
    <Link
      to="/p/$projectId"
      params={{ projectId }}
      title={label}
      onClick={(click) => click.stopPropagation()}
      className={cn(
        className,
        'hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-selection',
      )}
    >
      {content}
    </Link>
  );
}

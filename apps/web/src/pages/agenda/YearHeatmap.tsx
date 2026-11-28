import { activityLevel, addDays, type ActivityLevel, type DateKey } from '@trama/core';
import { cn } from '@trama/ui';
import { ChevronLeftIcon, ChevronRightIcon } from '@trama/ui/icons';
import { useEffect, useMemo, useRef } from 'react';
import { longDate, MONTHS_SHORT, shortDate, yearGrid } from './dates';

/** De "sem nada" a "dia cheio": só tons de cinza, como na tela 7. */
const LEVELS: Record<ActivityLevel, string> = {
  0: 'bg-border-subtle',
  1: 'bg-text-muted/40',
  2: 'bg-text-muted/70',
  3: 'bg-text',
  4: 'bg-text-strong',
};

const CELL = 15;
const GAP = 4;

const arrowButton =
  'inline-flex size-8 items-center justify-center rounded-control text-text-muted transition-colors hover:bg-hover hover:text-text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-selection';

const countLabel = (count: number) =>
  count === 0
    ? 'Nenhum dia com algo feito'
    : `${count} ${count === 1 ? 'dia' : 'dias'} com algo feito`;

/**
 * O ano em quadradinhos (tela 7): uma coluna por semana, uma linha por dia da semana, mais
 * escuro ou mais claro conforme quanto foi feito no dia. As setas do teclado andam pelos dias
 * (esquerda e direita pulam uma semana), e clicar escolhe o dia.
 */
export function YearHeatmap({
  year,
  counts,
  selected,
  today,
  loading,
  onSelect,
  onShiftYear,
}: {
  year: number;
  counts: ReadonlyMap<DateKey, number>;
  selected: DateKey;
  today: DateKey;
  loading: boolean;
  onSelect: (key: DateKey) => void;
  onShiftYear: (delta: number) => void;
}) {
  const grid = useMemo(() => yearGrid(year), [year]);
  const root = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const wantsFocus = useRef(false);
  const daysWithEvents = [...counts.values()].filter((count) => count > 0).length;

  // Em tela estreita o ano rola por dentro do cartão: deixa o dia escolhido à vista.
  useEffect(() => {
    const box = scroller.current;
    const cell = root.current?.querySelector<HTMLElement>(`[data-day="${selected}"]`);
    if (!box || !cell) return;
    const view = box.getBoundingClientRect();
    const at = cell.getBoundingClientRect();
    if (at.left < view.left || at.right > view.right) {
      box.scrollLeft += at.left - view.left - (view.width - at.width) / 2;
    }
  }, [selected, year]);

  // Depois de andar pelo teclado, o foco acompanha o dia escolhido (mesmo trocando de ano).
  useEffect(() => {
    if (!wantsFocus.current) return;
    wantsFocus.current = false;
    root.current?.querySelector<HTMLButtonElement>(`[data-day="${selected}"]`)?.focus();
  }, [selected, year]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const step = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    wantsFocus.current = true;
    onSelect(addDays(selected, step));
  };

  return (
    <section
      aria-labelledby="ano-titulo"
      className="rounded-block border border-border-subtle bg-surface p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={arrowButton}
            aria-label="Ano anterior"
            onClick={() => onShiftYear(-1)}
          >
            <ChevronLeftIcon aria-hidden className="size-4" />
          </button>
          <h2
            id="ano-titulo"
            className="min-w-12 text-center text-[15px] font-semibold text-text-strong"
          >
            {year}
          </h2>
          <button
            type="button"
            className={arrowButton}
            aria-label="Próximo ano"
            onClick={() => onShiftYear(1)}
          >
            <ChevronRightIcon aria-hidden className="size-4" />
          </button>
        </div>
        <p className="text-[13px] text-text-muted" aria-live="polite">
          {loading ? 'Carregando…' : countLabel(daysWithEvents)}
        </p>
      </div>

      <div ref={scroller} className="mt-4 overflow-x-auto pb-1">
        <div
          ref={root}
          role="group"
          aria-label={`Dias de ${year}`}
          onKeyDown={onKeyDown}
          className={cn('w-max transition-opacity', loading && 'opacity-60')}
        >
          <div className="flex" style={{ gap: GAP }}>
            {grid.columns.map((column, index) => (
              <div key={index} className="flex flex-col" style={{ gap: GAP }}>
                {column.days.map((key, row) =>
                  key === null ? (
                    <span key={row} aria-hidden style={{ width: CELL, height: CELL }} />
                  ) : (
                    <DayCell
                      key={key}
                      day={key}
                      count={counts.get(key) ?? 0}
                      isSelected={key === selected}
                      isToday={key === today}
                      onSelect={onSelect}
                    />
                  ),
                )}
              </div>
            ))}
          </div>
          <div
            aria-hidden
            className="relative mt-2 h-4 text-xs text-text-muted"
            style={{ width: grid.columns.length * (CELL + GAP) }}
          >
            {grid.monthColumns.map((column, month) => (
              <span key={month} className="absolute" style={{ left: column * (CELL + GAP) }}>
                {MONTHS_SHORT[month]}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function DayCell({
  day,
  count,
  isSelected,
  isToday,
  onSelect,
}: {
  day: DateKey;
  count: number;
  isSelected: boolean;
  isToday: boolean;
  onSelect: (key: DateKey) => void;
}) {
  const what = count === 0 ? 'nada registrado' : count === 1 ? '1 registro' : `${count} registros`;
  return (
    <button
      type="button"
      data-day={day}
      tabIndex={isSelected ? 0 : -1}
      aria-pressed={isSelected}
      aria-label={`${longDate(day)}: ${what}${isToday ? ' (hoje)' : ''}`}
      title={`${shortDate(day)}: ${what}`}
      onClick={() => onSelect(day)}
      style={{ width: CELL, height: CELL }}
      className={cn(
        'rounded-[3px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-selection',
        LEVELS[activityLevel(count)],
        isSelected && 'outline-2 outline-offset-1 outline-selection',
      )}
    />
  );
}

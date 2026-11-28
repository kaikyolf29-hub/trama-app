import {
  countEventsByDay,
  groupEventsByDay,
  localDateKey,
  parseDateKey,
  todayKey,
  type AgendaEvent,
  type CreateNoteRequest,
  type DateKey,
} from '@trama/core';
import { Alert, Button, cn } from '@trama/ui';
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from '@trama/ui/icons';
import { useMemo, useState } from 'react';
import type { AgendaApi } from '../../api/agenda-api';
import { useAuth } from '../../auth/context';
import { useServices } from '../../services';
import { AppSidebar } from '../AppSidebar';
import { DayEvents } from './DayEvents';
import { longDate, panelDate, shiftFocus, type AgendaView } from './dates';
import { MonthCalendar } from './MonthCalendar';
import { NoteDialog } from './NoteDialog';
import { useYearEvents } from './use-year-events';
import { YearHeatmap } from './YearHeatmap';

const VIEWS: { id: AgendaView; label: string }[] = [
  { id: 'year', label: 'Ano' },
  { id: 'month', label: 'Mês' },
  { id: 'day', label: 'Dia' },
];

const arrowButton =
  'inline-flex size-8 items-center justify-center rounded-control text-text-muted transition-colors hover:bg-hover hover:text-text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-selection';

/**
 * A Agenda (tela 7): tudo que a pessoa criou, terminou ou estudou, no dia e na hora em que
 * aconteceu. O ano em quadradinhos, o mês com o que foi feito e o detalhe do dia.
 */
export function AgendaPage() {
  const { user, client } = useAuth();
  const { agenda } = useServices();

  return (
    <div className="min-h-dvh bg-page md:flex">
      <AppSidebar current="agenda" email={user?.email} onSignOut={() => void client.signOut()} />
      <main className="mx-auto flex min-w-0 max-w-[1184px] flex-1 flex-col gap-8 px-4 py-10 sm:px-8 md:px-12 md:py-14">
        {agenda ? (
          <AgendaContent api={agenda} />
        ) : (
          <>
            <Heading />
            <Alert tone="info">
              A API ainda não está ligada neste ambiente. Preencha VITE_API_URL em apps/web/.env.
            </Alert>
          </>
        )}
      </main>
    </div>
  );
}

function Heading() {
  return (
    <div>
      <h1 className="font-serif text-4xl font-semibold text-text-strong">Agenda</h1>
      <p className="mt-1 text-[15px] text-text-muted">
        Tudo que você criou, terminou ou estudou, no dia e na hora em que aconteceu.
      </p>
    </div>
  );
}

function AgendaContent({ api }: { api: AgendaApi }) {
  const { timeZone, now } = useServices();
  const today = todayKey(now(), timeZone);
  const [view, setView] = useState<AgendaView>('month');
  const [focus, setFocus] = useState<DateKey>(today);
  const [writing, setWriting] = useState(false);

  const { year, month } = parseDateKey(focus);
  const data = useYearEvents(api, year, timeZone);
  const loading = data.status === 'loading';

  const byDay = useMemo(() => groupEventsByDay(data.events, timeZone), [data.events, timeZone]);
  const counts = useMemo(() => countEventsByDay(data.events, timeZone), [data.events, timeZone]);
  const dayEvents = byDay.get(focus) ?? [];
  const monthPrefix = focus.slice(0, 7);
  const monthIsEmpty = ![...byDay.keys()].some((key) => key.startsWith(monthPrefix));

  const shift = (delta: number, unit: AgendaView = view) =>
    setFocus(shiftFocus(focus, unit, delta));

  const save = async (input: CreateNoteRequest) => {
    const created = await api.createNote(input);
    data.add(created);
    setFocus(localDateKey(created.occurredAt, timeZone));
    setWriting(false);
  };

  const remove = async (event: AgendaEvent) => {
    await api.remove(event.id);
    data.remove(event.id);
  };

  const closeDialog = () => {
    setWriting(false);
    document.getElementById('registrar-algo')?.focus();
  };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <Heading />
        <div className="flex flex-wrap items-center gap-2">
          <Button id="registrar-algo" onClick={() => setWriting(true)}>
            <PlusIcon aria-hidden className="size-4" />
            Registrar algo
          </Button>
          <Button variant="secondary" onClick={() => setFocus(today)}>
            Hoje
          </Button>
          <div
            role="group"
            aria-label="Visão"
            className="flex rounded-control border border-border-subtle bg-surface p-0.5"
          >
            {VIEWS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                aria-pressed={view === id}
                onClick={() => setView(id)}
                className={cn(
                  'h-8 rounded-tag px-3.5 text-[15px] transition-colors focus-visible:outline-2 focus-visible:outline-selection',
                  view === id
                    ? 'bg-hover text-text-strong'
                    : 'text-text-muted hover:text-text-strong',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {data.status === 'failed' ? (
        <Alert tone="error">
          <p>{data.message}</p>
          <Button variant="secondary" className="mt-3" onClick={data.retry}>
            Tentar de novo
          </Button>
        </Alert>
      ) : view === 'day' ? (
        <section aria-labelledby="dia-titulo" className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-x-3">
            <h2
              id="dia-titulo"
              className="text-xl font-semibold text-text-strong first-letter:uppercase"
            >
              {longDate(focus)}
            </h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className={arrowButton}
                aria-label="Dia anterior"
                onClick={() => shift(-1)}
              >
                <ChevronLeftIcon aria-hidden className="size-4" />
              </button>
              <button
                type="button"
                className={arrowButton}
                aria-label="Próximo dia"
                onClick={() => shift(1)}
              >
                <ChevronRightIcon aria-hidden className="size-4" />
              </button>
            </div>
          </div>
          <div className="mt-6">
            <DayBody loading={loading} events={dayEvents} timeZone={timeZone} onRemove={remove} />
          </div>
        </section>
      ) : (
        <>
          <YearHeatmap
            year={year}
            counts={counts}
            selected={focus}
            today={today}
            loading={loading}
            onSelect={setFocus}
            onShiftYear={(delta) => shift(delta, 'year')}
          />
          <div className="flex flex-col gap-8 xl:flex-row xl:items-start">
            {view === 'month' && (
              <div className="min-w-0 flex-1">
                <MonthCalendar
                  year={year}
                  month={month}
                  eventsByDay={byDay}
                  selected={focus}
                  today={today}
                  loading={loading}
                  empty={monthIsEmpty}
                  onSelect={setFocus}
                  onShiftMonth={(delta) => shift(delta, 'month')}
                />
              </div>
            )}
            <aside
              aria-labelledby="painel-dia"
              className={cn(
                'rounded-block border border-border-subtle bg-surface p-6',
                view === 'month' ? 'xl:w-[336px] xl:shrink-0' : 'w-full max-w-2xl',
              )}
            >
              <h2
                id="painel-dia"
                className="mb-5 text-[13px] font-semibold tracking-wider text-text-muted uppercase"
              >
                {panelDate(focus)}
              </h2>
              <DayBody loading={loading} events={dayEvents} timeZone={timeZone} onRemove={remove} />
            </aside>
          </div>
        </>
      )}

      {writing && <NoteDialog now={now} timeZone={timeZone} onSave={save} onClose={closeDialog} />}
    </>
  );
}

/** A lista do dia, com o aviso de carregando ou de vazio e a nota sobre a hora automática. */
function DayBody({
  loading,
  events,
  timeZone,
  onRemove,
}: {
  loading: boolean;
  events: AgendaEvent[];
  timeZone: string;
  onRemove: (event: AgendaEvent) => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-5">
      {loading ? (
        <p className="text-sm text-text-muted">Carregando…</p>
      ) : (
        <DayEvents
          events={events}
          timeZone={timeZone}
          emptyText="Nada registrado neste dia."
          onRemove={onRemove}
        />
      )}
      <p className="border-t border-border-subtle pt-4 text-[13px] leading-relaxed text-text-muted">
        A hora é registrada sozinha. Você só escolhe a data se quiser anotar algo do passado.
      </p>
    </div>
  );
}

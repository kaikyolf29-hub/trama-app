import { sortEvents, yearRange, type AgendaEvent } from '@trama/core';
import { useCallback, useEffect, useState } from 'react';
import type { AgendaApi } from '../../api/agenda-api';

type Loaded =
  | { year: number; status: 'ready'; events: AgendaEvent[] }
  | { year: number; status: 'failed'; message: string };

export type YearEvents =
  | { status: 'loading'; events: AgendaEvent[] }
  | { status: 'ready'; events: AgendaEvent[] }
  | { status: 'failed'; events: AgendaEvent[]; message: string };

/**
 * Os eventos do ano pedido (uma consulta só cobre o quadro do ano, o mês e o dia). Trocar de
 * ano busca de novo; andar dentro do ano, não. `add` e `remove` mexem na lista já carregada
 * depois de anotar ou apagar, sem pedir tudo outra vez.
 */
export function useYearEvents(api: AgendaApi, year: number, timeZone: string) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    api.list(yearRange(year, timeZone)).then(
      (events) => alive && setLoaded({ year, status: 'ready', events: sortEvents(events) }),
      (error: unknown) =>
        alive &&
        setLoaded({
          year,
          status: 'failed',
          message: error instanceof Error ? error.message : 'Não deu para carregar a Agenda.',
        }),
    );
    return () => {
      alive = false;
    };
  }, [api, year, timeZone, attempt]);

  const retry = useCallback(() => {
    setLoaded(null);
    setAttempt((value) => value + 1);
  }, []);

  const add = useCallback((event: AgendaEvent) => {
    setLoaded((current) =>
      current?.status === 'ready'
        ? { ...current, events: sortEvents([...current.events, event]) }
        : current,
    );
  }, []);

  const remove = useCallback((id: string) => {
    setLoaded((current) =>
      current?.status === 'ready'
        ? { ...current, events: current.events.filter((event) => event.id !== id) }
        : current,
    );
  }, []);

  // Dados de outro ano (a pessoa acabou de trocar) contam como "carregando".
  const state: YearEvents =
    loaded && loaded.year === year
      ? loaded.status === 'ready'
        ? { status: 'ready', events: loaded.events }
        : { status: 'failed', events: [], message: loaded.message }
      : { status: 'loading', events: [] };

  return { ...state, retry, add, remove };
}

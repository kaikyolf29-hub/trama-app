import type { AgendaEvent } from '@trama/core';
import { ApiError } from '../api/http';
import type { AgendaApi } from '../api/agenda-api';

/** A API da Agenda em memória, para os testes das telas. */
export function createFakeAgenda(initial: AgendaEvent[] = []) {
  const events = new Map<string, AgendaEvent>(initial.map((event) => [event.id, event]));
  const calls = {
    list: [] as { from: string; to: string }[],
    createNote: [] as Parameters<AgendaApi['createNote']>[0][],
    remove: [] as string[],
  };
  const failures: { method: 'list' | 'createNote' | 'remove'; message: string }[] = [];
  let next = 1000;

  const check = (method: 'list' | 'createNote' | 'remove') => {
    const index = failures.findIndex((failure) => failure.method === method);
    const [failure] = index === -1 ? [] : failures.splice(index, 1);
    if (failure) throw new ApiError(failure.message, 500);
  };

  const api: AgendaApi = {
    list: (range) => {
      calls.list.push(range);
      try {
        check('list');
      } catch (error) {
        return Promise.reject(error as Error);
      }
      return Promise.resolve(
        [...events.values()]
          .filter((event) => event.occurredAt >= range.from && event.occurredAt < range.to)
          .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
      );
    },
    createNote: (input) => {
      calls.createNote.push(input);
      try {
        check('createNote');
      } catch (error) {
        return Promise.reject(error as Error);
      }
      const at = new Date(input.occurredAt ?? '2026-11-27T15:00:00.000Z').toISOString();
      const event: AgendaEvent = {
        id: `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`,
        type: 'note',
        occurredAt: at,
        projectId: null,
        projectKind: null,
        lessonId: null,
        title: input.title,
        detail: input.detail ?? null,
        source: 'manual',
        createdAt: at,
      };
      events.set(event.id, event);
      return Promise.resolve(event);
    },
    remove: (id) => {
      calls.remove.push(id);
      try {
        check('remove');
      } catch (error) {
        return Promise.reject(error as Error);
      }
      events.delete(id);
      return Promise.resolve();
    },
  };

  return {
    api,
    events,
    calls,
    /** A próxima chamada deste método falha com esta mensagem. */
    failNext: (method: 'list' | 'createNote' | 'remove', message: string) =>
      failures.push({ method, message }),
  };
}

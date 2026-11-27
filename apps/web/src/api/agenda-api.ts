import {
  eventListSchema,
  eventSchema,
  type AgendaEvent,
  type CreateNoteRequest,
  type InstantRange,
} from '@trama/core';
import { z } from 'zod';
import { createCaller, type ApiClientOptions } from './http';

/** O que a tela Agenda usa da API (apps/api, rotas `/events`). */
export interface AgendaApi {
  /** Eventos de `from` (incluído) até `to` (excluído), do mais antigo ao mais novo. */
  list(range: InstantRange): Promise<AgendaEvent[]>;
  /** Anotação feita à mão ("Registrar algo"); sem `occurredAt`, vale agora. */
  createNote(input: CreateNoteRequest): Promise<AgendaEvent>;
  /** Só anotações feitas à mão se apagam. */
  remove(id: string): Promise<void>;
}

/** Cliente da Agenda. Toda resposta passa pelos esquemas do `@trama/core`. */
export function createAgendaApi(options: ApiClientOptions): AgendaApi {
  const call = createCaller(options);

  return {
    list: ({ from, to }) =>
      call(
        `/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        eventListSchema,
      ),
    createNote: (input) =>
      call('/events', eventSchema, { method: 'POST', body: JSON.stringify(input) }),
    // A API responde 204, sem corpo: o `call` lê como `undefined`.
    remove: (id) => call(`/events/${encodeURIComponent(id)}`, z.undefined(), { method: 'DELETE' }),
  };
}

import { z } from 'zod';
import { DEFAULT_TIME_ZONE, localDateKey, type DateKey } from './calendar';
import { projectKindLabels, projectKindSchema } from './project';
import { dateTimeSchema } from './status';

/**
 * Eventos da Agenda (docs/PLAN.md, tabela `events`): o que aconteceu e quando. O banco grava
 * sozinho os automáticos (projeto criado, editado, concluído, aula estudada ou revisada); a
 * pessoa só escreve à mão uma anotação, com a data e a hora que escolher.
 */
export const eventTypeSchema = z.enum([
  'created',
  'edited',
  'completed',
  'studied',
  'reviewed',
  'note',
]);
export type EventType = z.infer<typeof eventTypeSchema>;

export const eventTypeLabels: Record<EventType, string> = {
  created: 'Criado',
  edited: 'Editado',
  completed: 'Concluído',
  studied: 'Aula estudada',
  reviewed: 'Aula revisada',
  note: 'Anotação',
};

/** `auto` é o que o Trama registra sozinho; `manual` é a anotação da pessoa. */
export const eventSourceSchema = z.enum(['auto', 'manual']);
export type EventSource = z.infer<typeof eventSourceSchema>;

export const eventTitleSchema = z.string().trim().min(1).max(200);
export const eventDetailSchema = z.string().trim().max(500);

export const eventSchema = z
  .object({
    id: z.uuid(),
    type: eventTypeSchema,
    /** Quando aconteceu (não quando foi gravado). */
    occurredAt: dateTimeSchema,
    /** Some (null) se o projeto for apagado: o título abaixo continua. */
    projectId: z.uuid().nullable().default(null),
    /** Tipo do projeto na hora, para dizer "Fluxo criado" ou "Roteiro criado". */
    projectKind: projectKindSchema.nullable().default(null),
    lessonId: z.uuid().nullable().default(null),
    /** Nome guardado na hora: renomear ou apagar o projeto não muda o passado. */
    title: eventTitleSchema,
    /** Segunda linha, ex.: o caderno de uma aula. */
    detail: eventDetailSchema.nullable().default(null),
    source: eventSourceSchema,
    createdAt: dateTimeSchema,
  })
  .refine((event) => (event.type === 'note') === (event.source === 'manual'), {
    message: 'só a anotação é manual, e toda anotação é manual',
    path: ['source'],
  });

export type AgendaEvent = z.infer<typeof eventSchema>;

/** Só as anotações à mão podem ser apagadas; o resto é o histórico do Trama. */
export function canDeleteEvent(event: Pick<AgendaEvent, 'source'>): boolean {
  return event.source === 'manual';
}

/** Frase curta de cada evento ("Fluxo criado", "Aula estudada"). */
export function eventLabel(event: Pick<AgendaEvent, 'type' | 'projectKind'>): string {
  if (event.type === 'created' || event.type === 'edited' || event.type === 'completed') {
    const kind = event.projectKind ? projectKindLabels[event.projectKind] : 'Projeto';
    const verb = { created: 'criado', edited: 'editado', completed: 'concluído' }[event.type];
    return `${kind} ${verb}`;
  }
  return eventTypeLabels[event.type];
}

/** Uma anotação feita à mão pode ser do passado, mas não do futuro (com 5 min de folga do relógio). */
export const NOTE_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

export function isFutureNote(occurredAt: string, now: Date = new Date()): boolean {
  return new Date(occurredAt).getTime() > now.getTime() + NOTE_FUTURE_TOLERANCE_MS;
}

/** Do mais antigo para o mais novo; empate pelo id, para a ordem ser sempre a mesma. */
export function sortEvents<T extends Pick<AgendaEvent, 'id' | 'occurredAt'>>(
  events: readonly T[],
): T[] {
  return [...events].sort(
    (a, b) =>
      new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime() ||
      a.id.localeCompare(b.id),
  );
}

type Dated = Pick<AgendaEvent, 'id' | 'occurredAt'>;

function groupBy<T extends Dated, K>(events: readonly T[], keyOf: (event: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const event of sortEvents(events)) {
    const key = keyOf(event);
    const list = groups.get(key);
    if (list) list.push(event);
    else groups.set(key, [event]);
  }
  return groups;
}

/** Eventos por dia (`2026-11-12`) no fuso da pessoa; dentro do dia, do mais cedo ao mais tarde. */
export function groupEventsByDay<T extends Dated>(
  events: readonly T[],
  timeZone: string = DEFAULT_TIME_ZONE,
): Map<DateKey, T[]> {
  return groupBy(events, (event) => localDateKey(event.occurredAt, timeZone));
}

/** Eventos por mês (`2026-11`) no fuso da pessoa. */
export function groupEventsByMonth<T extends Dated>(
  events: readonly T[],
  timeZone: string = DEFAULT_TIME_ZONE,
): Map<string, T[]> {
  return groupBy(events, (event) => localDateKey(event.occurredAt, timeZone).slice(0, 7));
}

/** Eventos por ano no fuso da pessoa. */
export function groupEventsByYear<T extends Dated>(
  events: readonly T[],
  timeZone: string = DEFAULT_TIME_ZONE,
): Map<number, T[]> {
  return groupBy(events, (event) => Number(localDateKey(event.occurredAt, timeZone).slice(0, 4)));
}

/** Quantos eventos há em cada dia: é o que pinta os quadradinhos do ano. */
export function countEventsByDay<T extends Dated>(
  events: readonly T[],
  timeZone: string = DEFAULT_TIME_ZONE,
): Map<DateKey, number> {
  const counts = new Map<DateKey, number>();
  for (const event of events) {
    const key = localDateKey(event.occurredAt, timeZone);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Intensidade de 0 (nada) a 4 de um dia no quadro do ano. */
export type ActivityLevel = 0 | 1 | 2 | 3 | 4;

export function activityLevel(count: number): ActivityLevel {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 5) return 3;
  return 4;
}

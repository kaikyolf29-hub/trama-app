import { describe, expect, it } from 'vitest';
import {
  activityLevel,
  canDeleteEvent,
  countEventsByDay,
  eventLabel,
  eventSchema,
  groupEventsByDay,
  groupEventsByMonth,
  groupEventsByYear,
  isFutureNote,
  sortEvents,
  type AgendaEvent,
} from './agenda';

function event(n: number, occurredAt: string, extra: Partial<AgendaEvent> = {}): AgendaEvent {
  return eventSchema.parse({
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    type: 'created',
    occurredAt,
    projectId: '6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f',
    projectKind: 'flow',
    title: 'Como editar 10x mais rápido',
    source: 'auto',
    createdAt: occurredAt,
    ...extra,
  });
}

describe('eventSchema', () => {
  it('preenche os campos opcionais com null', () => {
    const parsed = event(1, '2026-11-12T14:32:00-03:00');
    expect(parsed.lessonId).toBeNull();
    expect(parsed.detail).toBeNull();
  });

  it('só a anotação é manual', () => {
    expect(
      eventSchema.safeParse({
        ...event(1, '2026-11-12T14:32:00-03:00'),
        type: 'note',
        source: 'auto',
      }).success,
    ).toBe(false);
    expect(
      eventSchema.safeParse({
        ...event(1, '2026-11-12T14:32:00-03:00'),
        type: 'created',
        source: 'manual',
      }).success,
    ).toBe(false);
    expect(
      eventSchema.safeParse({
        ...event(1, '2026-11-12T14:32:00-03:00'),
        type: 'note',
        source: 'manual',
        projectId: null,
        projectKind: null,
      }).success,
    ).toBe(true);
  });

  it('recusa título vazio e data sem fuso', () => {
    const base = event(1, '2026-11-12T14:32:00-03:00');
    expect(eventSchema.safeParse({ ...base, title: '  ' }).success).toBe(false);
    expect(eventSchema.safeParse({ ...base, occurredAt: '2026-11-12 14:32' }).success).toBe(false);
    expect(eventSchema.safeParse({ ...base, type: 'visto' }).success).toBe(false);
  });
});

describe('rótulos e permissões', () => {
  it('diz o tipo do projeto nos eventos de projeto', () => {
    expect(eventLabel({ type: 'created', projectKind: 'flow' })).toBe('Fluxo criado');
    expect(eventLabel({ type: 'edited', projectKind: 'script' })).toBe('Roteiro editado');
    expect(eventLabel({ type: 'completed', projectKind: 'notebook' })).toBe('Caderno concluído');
    expect(eventLabel({ type: 'created', projectKind: null })).toBe('Projeto criado');
    expect(eventLabel({ type: 'studied', projectKind: 'notebook' })).toBe('Aula estudada');
    expect(eventLabel({ type: 'note', projectKind: null })).toBe('Anotação');
  });

  it('só apaga o que é manual', () => {
    expect(canDeleteEvent({ source: 'manual' })).toBe(true);
    expect(canDeleteEvent({ source: 'auto' })).toBe(false);
  });

  it('anotação pode ser do passado, não do futuro', () => {
    const now = new Date('2026-11-27T12:00:00Z');
    expect(isFutureNote('2020-01-01T00:00:00Z', now)).toBe(false);
    expect(isFutureNote('2026-11-27T12:03:00Z', now)).toBe(false);
    expect(isFutureNote('2026-11-27T12:10:00Z', now)).toBe(true);
  });
});

describe('agrupar por dia, mês e ano no fuso da pessoa', () => {
  const events = [
    event(3, '2026-11-12T19:40:00-03:00'),
    event(1, '2026-11-12T14:32:00-03:00'),
    event(2, '2026-11-12T17:20:00-03:00', { type: 'studied' }),
    // 01:30 UTC de 13/11 ainda é 12/11 em São Paulo.
    event(4, '2026-11-13T01:30:00Z'),
    event(5, '2026-12-01T10:00:00-03:00'),
    event(6, '2027-01-01T00:30:00-03:00'),
  ];

  it('ordena do mais cedo ao mais tarde', () => {
    expect(sortEvents(events).map((e) => e.id.slice(-1))).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  it('agrupa por dia, em ordem', () => {
    const byDay = groupEventsByDay(events);
    expect([...byDay.keys()]).toEqual(['2026-11-12', '2026-12-01', '2027-01-01']);
    expect(byDay.get('2026-11-12')?.map((e) => e.id.slice(-1))).toEqual(['1', '2', '3', '4']);
  });

  it('o fuso muda o dia', () => {
    const byDay = groupEventsByDay(events, 'UTC');
    expect(byDay.get('2026-11-13')).toHaveLength(1);
    expect(byDay.get('2026-11-12')).toHaveLength(3);
  });

  it('agrupa por mês e por ano', () => {
    expect([...groupEventsByMonth(events).keys()]).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(groupEventsByMonth(events).get('2026-11')).toHaveLength(4);
    const byYear = groupEventsByYear(events);
    expect(byYear.get(2026)).toHaveLength(5);
    expect(byYear.get(2027)).toHaveLength(1);
  });

  it('conta por dia e dá a intensidade do quadradinho', () => {
    const counts = countEventsByDay(events);
    expect(counts.get('2026-11-12')).toBe(4);
    expect(counts.size).toBe(3);
    expect([0, 1, 2, 3, 4, 5, 6, 40].map(activityLevel)).toEqual([0, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('lista vazia não quebra', () => {
    expect(groupEventsByDay([]).size).toBe(0);
    expect(countEventsByDay([]).size).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import {
  createLessonRequestSchema,
  createNoteRequestSchema,
  listEventsQuerySchema,
  updateLessonRequestSchema,
} from './api-organization';

describe('GET /events', () => {
  it('aceita um intervalo com fuso e recusa o que não é data', () => {
    expect(
      listEventsQuerySchema.safeParse({
        from: '2026-11-01T03:00:00.000Z',
        to: '2026-12-01T03:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(
      listEventsQuerySchema.safeParse({ from: '2026-11-01T00:00:00-03:00', to: '2026-12-01' })
        .success,
    ).toBe(false);
    expect(listEventsQuerySchema.safeParse({ from: '2026-11-01T00:00:00Z' }).success).toBe(false);
  });

  it('o começo vem antes do fim e o intervalo tem limite', () => {
    const at = (day: string) => `${day}T00:00:00Z`;
    expect(
      listEventsQuerySchema.safeParse({ from: at('2026-11-02'), to: at('2026-11-01') }).success,
    ).toBe(false);
    expect(
      listEventsQuerySchema.safeParse({ from: at('2026-11-01'), to: at('2026-11-01') }).success,
    ).toBe(false);
    // Um ano inteiro (o quadro do ano) cabe; dois anos não.
    expect(
      listEventsQuerySchema.safeParse({ from: at('2026-01-01'), to: at('2027-01-01') }).success,
    ).toBe(true);
    expect(
      listEventsQuerySchema.safeParse({ from: at('2026-01-01'), to: at('2028-01-01') }).success,
    ).toBe(false);
  });
});

describe('POST /events (anotação)', () => {
  it('só o título é obrigatório; a data pode ser do passado', () => {
    expect(createNoteRequestSchema.parse({ title: '  Gravei o episódio 11  ' })).toEqual({
      title: 'Gravei o episódio 11',
    });
    expect(
      createNoteRequestSchema.safeParse({
        title: 'Reunião',
        detail: 'Com o cliente',
        occurredAt: '2025-03-04T10:00:00-03:00',
        projectId: '6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f',
      }).success,
    ).toBe(true);
  });

  it('recusa título vazio, data sem fuso e projeto que não é uuid', () => {
    expect(createNoteRequestSchema.safeParse({ title: '   ' }).success).toBe(false);
    expect(
      createNoteRequestSchema.safeParse({ title: 'a', occurredAt: '2025-03-04' }).success,
    ).toBe(false);
    expect(createNoteRequestSchema.safeParse({ title: 'a', projectId: 'x' }).success).toBe(false);
  });

  it('não deixa escolher o tipo nem a origem', () => {
    const parsed = createNoteRequestSchema.parse({ title: 'a', type: 'completed', source: 'auto' });
    expect(parsed).toEqual({ title: 'a' });
  });
});

describe('aulas', () => {
  it('criar pede só o título', () => {
    expect(createLessonRequestSchema.parse({ title: 'Atalhos de corte' })).toEqual({
      title: 'Atalhos de corte',
    });
    expect(createLessonRequestSchema.safeParse({}).success).toBe(false);
  });

  it('criar aceita estado e datas', () => {
    expect(
      createLessonRequestSchema.safeParse({
        title: 'Correção de cor básica',
        status: 'done',
        studiedAt: '2026-11-05T20:10:00-03:00',
        reviewOn: '2026-11-12',
        position: 3,
      }).success,
    ).toBe(true);
  });

  it('atualizar pede ao menos um campo e deixa limpar datas com null', () => {
    expect(updateLessonRequestSchema.safeParse({}).success).toBe(false);
    expect(updateLessonRequestSchema.safeParse({ title: undefined }).success).toBe(false);
    expect(updateLessonRequestSchema.safeParse({ reviewOn: null }).success).toBe(true);
    expect(
      updateLessonRequestSchema.safeParse({ studiedAt: null, status: 'studying' }).success,
    ).toBe(true);
    expect(updateLessonRequestSchema.safeParse({ status: 'pausada' }).success).toBe(false);
    expect(updateLessonRequestSchema.safeParse({ title: ' ' }).success).toBe(false);
  });
});

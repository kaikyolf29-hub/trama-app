import { describe, expect, it } from 'vitest';
import {
  createEmptyNotebook,
  displayStatus,
  lessonNeedsReview,
  lessonSchema,
  markReviewed,
  markStudied,
  nextReviewDate,
  notebookContentSchema,
  sortLessons,
  summarizeLessons,
  type Lesson,
} from './notebook';
import { projectSchema } from './project';

function lesson(n: number, extra: Partial<Lesson> = {}): Lesson {
  return lessonSchema.parse({
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    notebookId: '6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f',
    title: `Aula ${n}`,
    createdAt: '2026-11-01T10:00:00-03:00',
    updatedAt: '2026-11-01T10:00:00-03:00',
    ...extra,
  });
}

describe('notebookContentSchema', () => {
  it('conteúdo vazio vira caderno vazio, com a revisão em 7 dias', () => {
    expect(notebookContentSchema.parse({})).toEqual({
      schemaVersion: 1,
      description: '',
      color: 'blue',
      reviewAfterDays: 7,
    });
    expect(createEmptyNotebook().color).toBe('blue');
  });

  it('um projeto de caderno com conteúdo {} continua valendo', () => {
    const project = projectSchema.parse({
      id: '6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f',
      kind: 'notebook',
      title: 'Premiere Pro',
      content: {},
      createdAt: '2026-11-12T14:32:00-03:00',
      updatedAt: '2026-11-12T14:32:00-03:00',
    });
    expect(project.kind === 'notebook' && project.content.reviewAfterDays).toBe(7);
  });

  it('a cor é um nome de token, nunca hex', () => {
    expect(notebookContentSchema.safeParse({ color: 'green' }).success).toBe(true);
    expect(notebookContentSchema.safeParse({ color: '#00ff00' }).success).toBe(false);
  });

  it('recusa intervalo de revisão fora de 1 a 365 dias ou quebrado', () => {
    expect(notebookContentSchema.safeParse({ reviewAfterDays: 0 }).success).toBe(false);
    expect(notebookContentSchema.safeParse({ reviewAfterDays: 366 }).success).toBe(false);
    expect(notebookContentSchema.safeParse({ reviewAfterDays: 1.5 }).success).toBe(false);
  });
});

describe('lessonSchema', () => {
  it('preenche os padrões: estudando, sem datas', () => {
    const parsed = lesson(1);
    expect(parsed).toMatchObject({
      status: 'studying',
      notes: '',
      studiedAt: null,
      reviewedAt: null,
      reviewOn: null,
      position: 0,
    });
  });

  it('a data de revisão é só o dia, sem hora', () => {
    expect(lesson(1, { reviewOn: '2026-11-19' }).reviewOn).toBe('2026-11-19');
    expect(
      lessonSchema.safeParse({ ...lesson(1), reviewOn: '2026-11-19T10:00:00-03:00' }).success,
    ).toBe(false);
    expect(lessonSchema.safeParse({ ...lesson(1), reviewOn: '2026-13-40' }).success).toBe(false);
  });

  it('recusa título vazio, status desconhecido e posição negativa', () => {
    expect(lessonSchema.safeParse({ ...lesson(1), title: ' ' }).success).toBe(false);
    expect(lessonSchema.safeParse({ ...lesson(1), status: 'pausada' }).success).toBe(false);
    expect(lessonSchema.safeParse({ ...lesson(1), position: -1 }).success).toBe(false);
  });
});

describe('regras de revisão', () => {
  it('a próxima revisão é o dia do estudo (no fuso) mais os dias do caderno', () => {
    // 23:30 em São Paulo ainda é dia 12, mesmo já sendo dia 13 em UTC.
    expect(nextReviewDate('2026-11-13T02:30:00Z')).toBe('2026-11-19');
    expect(nextReviewDate('2026-11-13T02:30:00Z', 1)).toBe('2026-11-13');
    expect(nextReviewDate('2026-11-13T02:30:00Z', 7, 'UTC')).toBe('2026-11-20');
    expect(nextReviewDate(new Date('2026-12-28T12:00:00Z'), 7)).toBe('2027-01-04');
  });

  it('marcar como estudada: feito, com a hora e a revisão marcada', () => {
    const now = new Date('2026-11-12T17:32:00Z');
    expect(markStudied(now)).toEqual({
      status: 'done',
      studiedAt: '2026-11-12T17:32:00.000Z',
      reviewOn: '2026-11-19',
    });
    expect(markStudied(now, 3).reviewOn).toBe('2026-11-15');
  });

  it('marcar como revisada: feito, com a hora e a próxima revisão', () => {
    const now = new Date('2026-11-19T12:00:00Z');
    expect(markReviewed(now, 14)).toEqual({
      status: 'done',
      reviewedAt: '2026-11-19T12:00:00.000Z',
      reviewOn: '2026-12-03',
    });
  });

  it('o resultado de marcar cabe no esquema da aula', () => {
    const patch = markStudied(new Date('2026-11-12T17:32:00Z'));
    expect(lessonSchema.safeParse({ ...lesson(1), ...patch }).success).toBe(true);
  });

  it('feito com revisão de hoje ou antes volta a "Revisar"; estudando nunca', () => {
    const done = lesson(1, { status: 'done', reviewOn: '2026-11-19' });
    expect(lessonNeedsReview(done, '2026-11-18')).toBe(false);
    expect(lessonNeedsReview(done, '2026-11-19')).toBe(true);
    expect(lessonNeedsReview(done, '2026-12-01')).toBe(true);
    expect(displayStatus(done, '2026-11-18')).toBe('done');
    expect(displayStatus(done, '2026-11-19')).toBe('review');

    const studying = lesson(2, { status: 'studying', reviewOn: '2026-11-01' });
    expect(lessonNeedsReview(studying, '2026-11-19')).toBe(false);
    expect(displayStatus(studying, '2026-11-19')).toBe('studying');

    expect(lessonNeedsReview(lesson(3, { status: 'review' }), '2020-01-01')).toBe(true);
    expect(lessonNeedsReview(lesson(4, { status: 'done' }), '2030-01-01')).toBe(false);
  });
});

describe('ordem e resumo', () => {
  it('ordena pela posição e, no empate, pela criação', () => {
    const lessons = [
      lesson(3, { position: 2 }),
      lesson(2, { position: 0, createdAt: '2026-11-03T10:00:00-03:00' }),
      lesson(1, { position: 0 }),
    ];
    expect(sortLessons(lessons).map((l) => l.title)).toEqual(['Aula 1', 'Aula 2', 'Aula 3']);
  });

  it('resume o caderno como "12 aulas · 3 para revisar"', () => {
    const lessons = [
      lesson(1, { status: 'done', reviewOn: '2026-11-10' }),
      lesson(2, { status: 'done', reviewOn: '2026-12-10' }),
      lesson(3, { status: 'review' }),
      lesson(4, { status: 'studying' }),
    ];
    expect(summarizeLessons(lessons, '2026-11-12')).toEqual({
      total: 4,
      toReview: 2,
      studied: 3,
      progress: 0.75,
    });
    expect(summarizeLessons([], '2026-11-12')).toEqual({
      total: 0,
      toReview: 0,
      studied: 0,
      progress: 0,
    });
  });
});

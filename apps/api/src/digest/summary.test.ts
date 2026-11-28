import { describe, expect, it } from 'vitest';
import type { DigestData } from './store';
import {
  buildReminderContent,
  buildWeeklyContent,
  capList,
  rangeLabel,
  weeklyWindow,
} from './summary';

const SP = 'America/Sao_Paulo';

describe('weeklyWindow', () => {
  it('cobre de segunda a domingo da semana que passou, no fuso da pessoa', () => {
    // Segunda, 30 de novembro de 2026.
    const week = weeklyWindow('2026-11-30', SP);
    expect(week.from).toBe('2026-11-23T03:00:00.000Z');
    expect(week.to).toBe('2026-11-30T03:00:00.000Z');
    expect(week.firstDay).toBe('2026-11-23');
    expect(week.lastDay).toBe('2026-11-29');
    expect(week.reviewUntil).toBe('2026-12-06');
  });

  it('o fuso muda o instante, não o dia', () => {
    const week = weeklyWindow('2026-11-30', 'UTC');
    expect(week.from).toBe('2026-11-23T00:00:00.000Z');
    expect(week.to).toBe('2026-11-30T00:00:00.000Z');
  });
});

describe('rangeLabel', () => {
  it('escreve a semana em palavras', () => {
    expect(rangeLabel('2026-11-23', '2026-11-29')).toBe('23 a 29 de novembro');
    expect(rangeLabel('2026-11-30', '2026-12-06')).toBe('30 de novembro a 6 de dezembro');
  });
});

describe('capList', () => {
  it('corta no limite e conta o que ficou de fora', () => {
    const lines = Array.from({ length: 11 }, (_, i) => ({ title: `Aula ${String(i)}` }));
    const list = capList(lines);
    expect(list.items).toHaveLength(8);
    expect(list.more).toBe(3);
    expect(capList(lines.slice(0, 2))).toEqual({ items: lines.slice(0, 2), more: 0 });
  });
});

const data: DigestData = {
  events: [
    {
      type: 'studied',
      occurredAt: '2026-11-25T17:00:00.000Z',
      projectKind: 'notebook',
      title: 'Atalhos de corte',
      detail: 'Premiere Pro',
    },
    {
      type: 'reviewed',
      occurredAt: '2026-11-26T02:30:00.000Z',
      projectKind: 'notebook',
      title: 'Phrasal verbs',
      detail: 'Inglês',
    },
    {
      type: 'completed',
      occurredAt: '2026-11-27T15:00:00.000Z',
      projectKind: 'flow',
      title: 'Como editar 10x mais rápido',
      detail: null,
    },
  ],
  lessons: [
    {
      title: 'Correção de cor',
      notebookTitle: 'Premiere Pro',
      status: 'done',
      reviewOn: '2026-11-26',
    },
    { title: 'Áudio limpo', notebookTitle: 'Premiere Pro', status: 'done', reviewOn: '2026-11-30' },
    { title: 'Exportação', notebookTitle: 'Premiere Pro', status: 'done', reviewOn: '2026-12-03' },
    { title: 'Solta', notebookTitle: 'Inglês', status: 'review', reviewOn: null },
  ],
};

describe('buildWeeklyContent', () => {
  const content = buildWeeklyContent(data, { localDate: '2026-11-30', timeZone: SP });

  it('lista o que estudou e revisou, com o caderno e o dia no fuso da pessoa', () => {
    expect(content.studied.items).toEqual([
      { title: 'Atalhos de corte', detail: 'Premiere Pro · 25 nov' },
      // 02:30 UTC de 26 nov ainda é 25 nov em São Paulo.
      { title: 'Phrasal verbs', detail: 'Inglês · revisão · 25 nov' },
    ]);
  });

  it('lista os projetos concluídos com o tipo', () => {
    expect(content.completed.items).toEqual([
      { title: 'Como editar 10x mais rápido', detail: 'Fluxo · 27 nov' },
    ]);
  });

  it('diz quando cada revisão cai: atrasada, hoje, na semana ou sem data', () => {
    expect(content.toReview.items.map((line) => line.detail)).toEqual([
      'Premiere Pro · atrasada desde 26 nov',
      'Premiere Pro · hoje',
      'Premiere Pro · qui, 3 dez',
      'Inglês · marcada para revisar',
    ]);
    expect(content.rangeLabel).toBe('23 a 29 de novembro');
    expect(content.empty).toBe(false);
  });

  it('sem nada estudado, concluído nem para revisar, está vazio', () => {
    const none = buildWeeklyContent(
      { events: [], lessons: [] },
      { localDate: '2026-11-30', timeZone: SP },
    );
    expect(none.empty).toBe(true);
  });

  it('só aulas para revisar já bastam para mandar o resumo', () => {
    const only = buildWeeklyContent(
      { events: [], lessons: data.lessons.slice(0, 1) },
      { localDate: '2026-11-30', timeZone: SP },
    );
    expect(only.empty).toBe(false);
  });
});

describe('buildReminderContent', () => {
  it('traz as aulas de hoje e as atrasadas', () => {
    const list = buildReminderContent(
      { events: [], lessons: data.lessons.slice(0, 2) },
      '2026-11-30',
    );
    expect(list.items.map((line) => line.title)).toEqual(['Correção de cor', 'Áudio limpo']);
  });

  it('sem aulas, a lista é vazia (o e-mail não sai)', () => {
    expect(buildReminderContent({ events: [], lessons: [] }, '2026-11-30').items).toEqual([]);
  });
});

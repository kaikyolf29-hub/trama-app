import { describe, expect, it } from 'vitest';
import { dayLabel, lessonCount, notebookSubtitle, reviewLabel, studiedLabel } from './format';

const NOW = new Date('2026-11-27T15:00:00.000Z');

describe('rótulos da tabela de aulas (tela 6)', () => {
  it('"Estudado em" mostra dia e hora no fuso da pessoa', () => {
    expect(studiedLabel('2026-11-12T17:32:00.000Z', 'America/Sao_Paulo', NOW)).toBe(
      '12 nov · 14:32',
    );
    expect(studiedLabel('2026-11-24T12:15:00.000Z', 'America/Sao_Paulo', NOW)).toBe(
      '24 nov · 09:15',
    );
  });

  it('o fuso muda o dia: 02:00 UTC ainda é o dia anterior em São Paulo', () => {
    const instant = '2026-11-13T02:00:00.000Z';
    expect(studiedLabel(instant, 'America/Sao_Paulo', NOW)).toBe('12 nov · 23:00');
    expect(studiedLabel(instant, 'Europe/Lisbon', NOW)).toBe('13 nov · 02:00');
  });

  it('sem data, um traço; ano diferente aparece', () => {
    expect(studiedLabel(null, 'America/Sao_Paulo', NOW)).toBe('—');
    expect(studiedLabel('2025-12-01T15:00:00.000Z', 'America/Sao_Paulo', NOW)).toBe(
      '01 dez 2025 · 12:00',
    );
  });

  it('"Revisar em" diz Hoje no dia e a data nos outros', () => {
    expect(reviewLabel('2026-11-27', '2026-11-27')).toBe('Hoje');
    expect(reviewLabel('2026-12-01', '2026-11-27')).toBe('01 dez');
    expect(reviewLabel('2026-11-19', '2026-11-27')).toBe('19 nov');
    expect(reviewLabel(null, '2026-11-27')).toBe('—');
  });

  it('dayLabel põe zero à esquerda', () => {
    expect(dayLabel('2026-12-01', '2026-11-27')).toBe('01 dez');
  });
});

describe('cartão do caderno', () => {
  it('conta aulas no singular e no plural', () => {
    expect(lessonCount(1)).toBe('1 aula');
    expect(lessonCount(12)).toBe('12 aulas');
  });

  it('diz quantas faltam revisar ou que está em dia', () => {
    expect(notebookSubtitle(12, 3)).toBe('12 aulas · 3 para revisar');
    expect(notebookSubtitle(5, 0)).toBe('5 aulas · em dia');
    expect(notebookSubtitle(0, 0)).toBe('Nenhuma aula ainda');
  });
});

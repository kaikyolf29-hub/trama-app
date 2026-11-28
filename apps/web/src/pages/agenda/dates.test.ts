import { describe, expect, it } from 'vitest';
import {
  addMonths,
  longDate,
  monthTitle,
  panelDate,
  shiftFocus,
  shortDate,
  yearGrid,
} from './dates';

describe('textos de data', () => {
  it('escreve a data por extenso em português', () => {
    expect(longDate('2026-11-12')).toBe('quinta-feira, 12 de novembro de 2026');
    expect(panelDate('2026-11-12')).toBe('Quinta · 12 nov');
    expect(panelDate('2026-11-29')).toBe('Domingo · 29 nov');
    expect(shortDate('2026-03-05')).toBe('5 de março');
    expect(monthTitle(3)).toBe('Março');
  });
});

describe('andar entre períodos', () => {
  it('soma meses sem passar do fim do mês', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
    expect(addMonths('2026-11-12', -23)).toBe('2024-12-12');
  });

  it('anda um ano, um mês ou um dia conforme a visão', () => {
    expect(shiftFocus('2026-11-12', 'year', 1)).toBe('2027-11-12');
    expect(shiftFocus('2028-02-29', 'year', 1)).toBe('2029-02-28');
    expect(shiftFocus('2026-11-12', 'month', -1)).toBe('2026-10-12');
    expect(shiftFocus('2026-11-30', 'day', 1)).toBe('2026-12-01');
    expect(shiftFocus('2026-01-01', 'day', -1)).toBe('2025-12-31');
  });
});

describe('quadradinhos do ano', () => {
  it('2026 começa numa quinta e tem 53 colunas de 7 dias', () => {
    const { columns, monthColumns } = yearGrid(2026);
    expect(columns).toHaveLength(53);
    expect(columns.every((column) => column.days.length === 7)).toBe(true);
    // 1º de janeiro de 2026 é quinta: o domingo a quarta da primeira coluna ficam de fora.
    expect(columns[0]?.days).toEqual([
      null,
      null,
      null,
      null,
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
    ]);
    expect(columns[52]?.days).toEqual([
      '2026-12-27',
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      null,
      null,
    ]);
    expect(columns.flatMap((column) => column.days).filter(Boolean)).toHaveLength(365);
    expect(monthColumns).toHaveLength(12);
    expect(monthColumns[0]).toBe(0);
  });

  it('cada mês cai na coluna do seu dia 1', () => {
    const { columns, monthColumns } = yearGrid(2026);
    monthColumns.forEach((index, month) => {
      const key = `2026-${String(month + 1).padStart(2, '0')}-01`;
      expect(columns[index]?.days).toContain(key);
    });
  });

  it('ano bissexto tem 366 dias', () => {
    expect(
      yearGrid(2028)
        .columns.flatMap((column) => column.days)
        .filter(Boolean),
    ).toHaveLength(366);
  });
});

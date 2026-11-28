import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayRange,
  daysInMonth,
  isValidTimeZone,
  localDateKey,
  localTime,
  monthGrid,
  monthRange,
  timeZoneSchema,
  todayKey,
  weekdayOf,
  yearRange,
  zonedInstant,
} from './calendar';

describe('dia e hora no fuso', () => {
  it('usa o fuso de São Paulo por padrão', () => {
    expect(localDateKey('2026-11-12T14:32:00-03:00')).toBe('2026-11-12');
    expect(localTime('2026-11-12T14:32:00-03:00')).toBe('14:32');
  });

  it('o mesmo instante cai em dias diferentes conforme o fuso', () => {
    // 01:30 UTC do dia 13 ainda é noite do dia 12 em São Paulo.
    expect(localDateKey('2026-11-13T01:30:00Z')).toBe('2026-11-12');
    expect(localTime('2026-11-13T01:30:00Z')).toBe('22:30');
    expect(localDateKey('2026-11-13T01:30:00Z', 'UTC')).toBe('2026-11-13');
    expect(localDateKey('2026-11-13T01:30:00Z', 'Asia/Tokyo')).toBe('2026-11-13');
  });

  it('meia-noite é 00:00, não 24:00', () => {
    expect(localTime('2026-11-12T03:00:00Z')).toBe('00:00');
  });

  it('hoje depende do relógio e do fuso', () => {
    expect(todayKey(new Date('2026-11-27T02:00:00Z'))).toBe('2026-11-26');
    expect(todayKey(new Date('2026-11-27T02:00:00Z'), 'UTC')).toBe('2026-11-27');
  });

  it('recusa data inválida', () => {
    expect(() => localDateKey('ontem')).toThrow(RangeError);
  });

  it('valida nomes de fuso', () => {
    expect(isValidTimeZone('America/Sao_Paulo')).toBe(true);
    expect(isValidTimeZone('Marte/Olympus')).toBe(false);
    expect(timeZoneSchema.safeParse('Europe/Lisbon').success).toBe(true);
    expect(timeZoneSchema.safeParse('Marte').success).toBe(false);
  });
});

describe('instante de um relógio local', () => {
  it('00:00 em São Paulo é 03:00 em UTC', () => {
    expect(zonedInstant('2026-11-12', 0, 0).toISOString()).toBe('2026-11-12T03:00:00.000Z');
    expect(zonedInstant('2026-11-12', 14, 32).toISOString()).toBe('2026-11-12T17:32:00.000Z');
  });

  it('acompanha o horário de verão de outros fusos', () => {
    // Nova York: UTC-5 no inverno e UTC-4 no verão.
    expect(zonedInstant('2026-01-15', 12, 0, 'America/New_York').toISOString()).toBe(
      '2026-01-15T17:00:00.000Z',
    );
    expect(zonedInstant('2026-07-15', 12, 0, 'America/New_York').toISOString()).toBe(
      '2026-07-15T16:00:00.000Z',
    );
  });
});

describe('intervalos', () => {
  it('um dia vai de 00:00 a 00:00 do seguinte', () => {
    expect(dayRange('2026-11-12')).toEqual({
      from: '2026-11-12T03:00:00.000Z',
      to: '2026-11-13T03:00:00.000Z',
    });
  });

  it('um mês e um ano cobrem as viradas', () => {
    expect(monthRange(2026, 11)).toEqual({
      from: '2026-11-01T03:00:00.000Z',
      to: '2026-12-01T03:00:00.000Z',
    });
    expect(monthRange(2026, 12).to).toBe('2027-01-01T03:00:00.000Z');
    expect(yearRange(2026)).toEqual({
      from: '2026-01-01T03:00:00.000Z',
      to: '2027-01-01T03:00:00.000Z',
    });
  });
});

describe('contas com dias', () => {
  it('soma dias atravessando mês e ano', () => {
    expect(addDays('2026-11-27', 7)).toBe('2026-12-04');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('dia da semana e tamanho do mês', () => {
    expect(weekdayOf('2026-11-12')).toBe(4); // quinta, como na tela 7
    expect(weekdayOf('2026-11-01')).toBe(0);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 11)).toBe(30);
  });
});

describe('grade do mês', () => {
  it('novembro de 2026 tem 5 semanas e começa num domingo, como na tela 7', () => {
    const grid = monthGrid(2026, 11);
    expect(grid).toHaveLength(5);
    expect(grid.every((week) => week.length === 7)).toBe(true);
    expect(grid[0]?.[0]).toEqual({ key: '2026-11-01', inMonth: true });
    expect(grid[4]?.[1]).toEqual({ key: '2026-11-30', inMonth: true });
    expect(grid[4]?.[2]).toEqual({ key: '2026-12-01', inMonth: false });
  });

  it('completa a primeira semana com o mês anterior e usa 6 linhas quando precisa', () => {
    const grid = monthGrid(2026, 8); // 1º de agosto é sábado
    expect(grid).toHaveLength(6);
    expect(grid[0]?.[0]).toEqual({ key: '2026-07-26', inMonth: false });
    expect(grid[0]?.[6]).toEqual({ key: '2026-08-01', inMonth: true });
    expect(grid.flat().filter((cell) => cell.inMonth)).toHaveLength(31);
  });

  it('fevereiro de 2026 cabe em 4 semanas', () => {
    expect(monthGrid(2026, 2)).toHaveLength(4);
  });
});

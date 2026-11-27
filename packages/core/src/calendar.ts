import { z } from 'zod';

/**
 * Datas e fusos horários, sem biblioteca: tudo sai de `Intl`. A Agenda agrupa por dia no fuso da
 * pessoa (padrão America/Sao_Paulo, docs/PLAN.md, tabela `profiles`), e o banco guarda instantes
 * em UTC. "Chave de dia" é o texto `AAAA-MM-DD`, que não depende de fuso.
 */
export const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';

/** Dia sem hora nem fuso: `2026-11-12`. */
export const dateKeySchema = z.iso.date();
export type DateKey = string;

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Nome de fuso da IANA (ex.: America/Sao_Paulo). */
export const timeZoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(isValidTimeZone, { message: 'fuso horário inválido' });

export interface LocalParts {
  year: number;
  /** 1 a 12. */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function toMillis(instant: Date | string | number): number {
  const millis = instant instanceof Date ? instant.getTime() : new Date(instant).getTime();
  if (Number.isNaN(millis)) throw new RangeError(`data inválida: ${String(instant)}`);
  return millis;
}

/** Ano, mês, dia e hora na parede do relógio do fuso, no instante dado. */
export function localParts(
  instant: Date | string | number,
  timeZone: string = DEFAULT_TIME_ZONE,
): LocalParts {
  const parts: Record<string, number> = {};
  for (const part of formatterFor(timeZone).formatToParts(toMillis(instant))) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 0,
    day: parts.day ?? 0,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  };
}

const pad = (value: number, size = 2) => String(value).padStart(size, '0');

export function formatDateKey(year: number, month: number, day: number): DateKey {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

export function parseDateKey(key: DateKey): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) throw new RangeError(`dia inválido: ${key}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** O dia, no fuso, em que o instante cai. */
export function localDateKey(
  instant: Date | string | number,
  timeZone: string = DEFAULT_TIME_ZONE,
): DateKey {
  const { year, month, day } = localParts(instant, timeZone);
  return formatDateKey(year, month, day);
}

/** A hora, no fuso, como `14:32`. */
export function localTime(
  instant: Date | string | number,
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  const { hour, minute } = localParts(instant, timeZone);
  return `${pad(hour)}:${pad(minute)}`;
}

/** Hoje, no fuso da pessoa. */
export function todayKey(now: Date = new Date(), timeZone: string = DEFAULT_TIME_ZONE): DateKey {
  return localDateKey(now, timeZone);
}

/** Quanto o relógio do fuso está à frente do UTC, em milissegundos, naquele instante. */
function offsetMillis(instant: number, timeZone: string): number {
  const p = localParts(instant, timeZone);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wall - Math.floor(instant / 1000) * 1000;
}

/** O instante em que o relógio do fuso marca o dia e a hora dados. */
export function zonedInstant(
  key: DateKey,
  hour: number,
  minute: number,
  timeZone: string = DEFAULT_TIME_ZONE,
): Date {
  const { year, month, day } = parseDateKey(key);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  // Duas passadas cobrem a troca de horário de verão.
  const first = wall - offsetMillis(wall, timeZone);
  return new Date(wall - offsetMillis(first, timeZone));
}

/** Soma (ou subtrai) dias a uma chave de dia. */
export function addDays(key: DateKey, days: number): DateKey {
  const { year, month, day } = parseDateKey(key);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return formatDateKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** Dia da semana: 0 é domingo, 6 é sábado. */
export function weekdayOf(key: DateKey): number {
  const { year, month, day } = parseDateKey(key);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Mês de uma chave de dia: `2026-11`. */
export function monthKeyOf(key: DateKey): string {
  return key.slice(0, 7);
}

export interface InstantRange {
  /** Início, incluído (ISO em UTC). */
  from: string;
  /** Fim, excluído (ISO em UTC). */
  to: string;
}

function rangeBetween(fromKey: DateKey, toKey: DateKey, timeZone: string): InstantRange {
  return {
    from: zonedInstant(fromKey, 0, 0, timeZone).toISOString(),
    to: zonedInstant(toKey, 0, 0, timeZone).toISOString(),
  };
}

/** De 00:00 do dia até 00:00 do dia seguinte, no fuso. */
export function dayRange(key: DateKey, timeZone: string = DEFAULT_TIME_ZONE): InstantRange {
  return rangeBetween(key, addDays(key, 1), timeZone);
}

/** O mês inteiro (`month` de 1 a 12), no fuso. */
export function monthRange(
  year: number,
  month: number,
  timeZone: string = DEFAULT_TIME_ZONE,
): InstantRange {
  const next = month === 12 ? formatDateKey(year + 1, 1, 1) : formatDateKey(year, month + 1, 1);
  return rangeBetween(formatDateKey(year, month, 1), next, timeZone);
}

/** O ano inteiro, no fuso. */
export function yearRange(year: number, timeZone: string = DEFAULT_TIME_ZONE): InstantRange {
  return rangeBetween(formatDateKey(year, 1, 1), formatDateKey(year + 1, 1, 1), timeZone);
}

export interface MonthCell {
  key: DateKey;
  /** false nos dias da semana anterior ou seguinte que completam a grade. */
  inMonth: boolean;
}

/**
 * Grade do mês, de domingo a sábado, com as semanas inteiras (5 ou 6 linhas): os dias de fora
 * do mês aparecem apagados, como na tela 7.
 */
export function monthGrid(year: number, month: number): MonthCell[][] {
  const first = formatDateKey(year, month, 1);
  const total = daysInMonth(year, month);
  const lead = weekdayOf(first);
  const weeks = Math.ceil((lead + total) / 7);
  const start = addDays(first, -lead);
  return Array.from({ length: weeks }, (_, week) =>
    Array.from({ length: 7 }, (_, weekday) => {
      const key = addDays(start, week * 7 + weekday);
      return { key, inMonth: monthKeyOf(key) === monthKeyOf(first) };
    }),
  );
}

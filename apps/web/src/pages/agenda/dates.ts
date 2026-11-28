import {
  addDays,
  daysInMonth,
  formatDateKey,
  parseDateKey,
  weekdayOf,
  type DateKey,
} from '@trama/core';

/** As três visões da Agenda. */
export type AgendaView = 'year' | 'month' | 'day';

export const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const;

export const MONTHS_SHORT = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
] as const;

export const WEEKDAYS = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
] as const;

export const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** `Novembro`, com a inicial maiúscula (o título do mês). */
export function monthTitle(month: number): string {
  return capitalize(MONTHS[month - 1] ?? '');
}

/** `quinta-feira, 12 de novembro de 2026`. */
export function longDate(key: DateKey): string {
  const { year, month, day } = parseDateKey(key);
  return `${WEEKDAYS[weekdayOf(key)]}, ${day} de ${MONTHS[month - 1]} de ${year}`;
}

/** `Quinta · 12 nov` (o cabeçalho do painel do dia; a caixa alta vem do estilo). */
export function panelDate(key: DateKey): string {
  const { month, day } = parseDateKey(key);
  const weekday = (WEEKDAYS[weekdayOf(key)] ?? '').replace('-feira', '');
  return `${capitalize(weekday)} · ${day} ${MONTHS_SHORT[month - 1]}`;
}

/** `12 de novembro` (para frases curtas, como "Nada registrado em 12 de novembro"). */
export function shortDate(key: DateKey): string {
  const { month, day } = parseDateKey(key);
  return `${day} de ${MONTHS[month - 1]}`;
}

/** Soma meses a um dia; se o dia não existir no mês de chegada (31 de fevereiro), vai ao último. */
export function addMonths(key: DateKey, months: number): DateKey {
  const { year, month, day } = parseDateKey(key);
  const index = year * 12 + (month - 1) + months;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  return formatDateKey(nextYear, nextMonth, Math.min(day, daysInMonth(nextYear, nextMonth)));
}

/** Anda um período para trás (`-1`) ou para frente (`1`), conforme a visão. */
export function shiftFocus(key: DateKey, view: AgendaView, delta: number): DateKey {
  if (view === 'year') return addMonths(key, delta * 12);
  if (view === 'month') return addMonths(key, delta);
  return addDays(key, delta);
}

export interface YearColumn {
  /** 7 dias, de domingo a sábado; `null` fora do ano. */
  days: (DateKey | null)[];
}

export interface YearGrid {
  columns: YearColumn[];
  /** Em qual coluna cai o dia 1 de cada mês (índice 0 = janeiro). */
  monthColumns: number[];
}

/**
 * Os quadradinhos do ano da tela 7: uma coluna por semana (domingo a sábado) e uma linha por
 * dia da semana. A primeira e a última coluna ficam incompletas.
 */
export function yearGrid(year: number): YearGrid {
  const first = formatDateKey(year, 1, 1);
  const last = formatDateKey(year, 12, 31);
  const start = addDays(first, -weekdayOf(first));
  const columns: YearColumn[] = [];
  const monthColumns: number[] = [];
  for (let weekStart = start; weekStart <= last; weekStart = addDays(weekStart, 7)) {
    const days = Array.from({ length: 7 }, (_, i) => {
      const key = addDays(weekStart, i);
      return key.startsWith(`${String(year).padStart(4, '0')}-`) ? key : null;
    });
    days.forEach((key) => {
      if (key?.endsWith('-01')) monthColumns[parseDateKey(key).month - 1] = columns.length;
    });
    columns.push({ days });
  }
  return { columns, monthColumns };
}

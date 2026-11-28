import {
  localTime,
  parseDateKey,
  todayKey,
  type DateKey,
  type LessonStatus,
  type NoteColor,
} from '@trama/core';
import { MONTHS_SHORT } from '../agenda/dates';

const pad = (value: number) => String(value).padStart(2, '0');

/** `12 nov` (e o ano, `12 nov 2025`, quando não é o de `today`). */
export function dayLabel(key: DateKey, today: DateKey): string {
  const { year, month, day } = parseDateKey(key);
  const label = `${pad(day)} ${MONTHS_SHORT[month - 1]}`;
  return year === parseDateKey(today).year ? label : `${label} ${year}`;
}

/** Coluna "Estudado em" da tela 6: `12 nov · 14:32`; sem data, um traço. */
export function studiedLabel(
  instant: string | null,
  timeZone: string,
  now: Date,
  today: DateKey = todayKey(now, timeZone),
): string {
  if (instant === null) return '—';
  const key = todayKey(new Date(instant), timeZone);
  return `${dayLabel(key, today)} · ${localTime(instant, timeZone)}`;
}

/** Coluna "Revisar em": `Hoje` no dia, senão `19 nov`; sem data, um traço. */
export function reviewLabel(key: DateKey | null, today: DateKey): string {
  if (key === null) return '—';
  return key === today ? 'Hoje' : dayLabel(key, today);
}

/** `1 aula`, `12 aulas`. */
export function lessonCount(total: number): string {
  return `${total} ${total === 1 ? 'aula' : 'aulas'}`;
}

/** A segunda linha do cartão do caderno: `12 aulas · 3 para revisar` ou `5 aulas · em dia`. */
export function notebookSubtitle(total: number, toReview: number): string {
  if (total === 0) return 'Nenhuma aula ainda';
  return `${lessonCount(total)} · ${toReview === 0 ? 'em dia' : `${toReview} para revisar`}`;
}

/** Classes (estáticas, para o Tailwind achar) da cor de um caderno: fundo do cartão e barra. */
export const notebookColorClasses: Record<NoteColor, { head: string; bar: string; dot: string }> = {
  yellow: { head: 'bg-note-yellow-bg', bar: 'bg-note-yellow-fg', dot: 'bg-note-yellow-fg' },
  blue: { head: 'bg-note-blue-bg', bar: 'bg-note-blue-fg', dot: 'bg-note-blue-fg' },
  green: { head: 'bg-note-green-bg', bar: 'bg-note-green-fg', dot: 'bg-note-green-fg' },
  pink: { head: 'bg-note-pink-bg', bar: 'bg-note-pink-fg', dot: 'bg-note-pink-fg' },
};

export const notebookColorLabels: Record<NoteColor, string> = {
  yellow: 'Amarelo',
  blue: 'Azul',
  green: 'Verde',
  pink: 'Rosa',
};

/** Classes de cada selo (tela 6): verde para "Feito", amarelo para "Revisar", cinza para "Estudando". */
export const lessonBadgeClasses: Record<LessonStatus, string> = {
  done: 'bg-done-surface text-done-text',
  review: 'bg-note-yellow-bg text-note-yellow-fg',
  studying: 'bg-hover text-text-muted',
};

import {
  addDays,
  localDateKey,
  parseDateKey,
  projectKindLabels,
  weekdayOf,
  zonedInstant,
  type DateKey,
} from '@trama/core';
import type { DigestList, DigestLine } from '@trama/emails';
import type { DigestData, DigestEvent, DueLesson } from './store';

/** Quantas linhas cada bloco do e-mail mostra; o resto vira "e mais N". */
export const MAX_LINES = 8;

const MONTHS = [
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
const MONTHS_SHORT = [
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
const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

/** `25 nov`. */
function shortDay(key: DateKey): string {
  const { month, day } = parseDateKey(key);
  return `${String(day)} ${MONTHS_SHORT[month - 1]}`;
}

/** `qua, 2 dez`. */
function weekdayDay(key: DateKey): string {
  return `${WEEKDAYS_SHORT[weekdayOf(key)]}, ${shortDay(key)}`;
}

/** `23 a 29 de novembro`, ou `28 de novembro a 4 de dezembro` quando a semana vira o mês. */
export function rangeLabel(start: DateKey, end: DateKey): string {
  const a = parseDateKey(start);
  const b = parseDateKey(end);
  if (a.month === b.month) return `${String(a.day)} a ${String(b.day)} de ${MONTHS[b.month - 1]}`;
  return `${String(a.day)} de ${MONTHS[a.month - 1]} a ${String(b.day)} de ${MONTHS[b.month - 1]}`;
}

/** Corta a lista em `MAX_LINES` linhas e conta as que ficaram de fora. */
export function capList(lines: DigestLine[], max: number = MAX_LINES): DigestList {
  return { items: lines.slice(0, max), more: Math.max(0, lines.length - max) };
}

export interface WeeklyWindow {
  /** O início da semana resumida, às 00:00 do fuso (incluído). */
  from: string;
  /** O fim, às 00:00 da segunda de hoje (excluído). */
  to: string;
  /** Até este dia (o domingo da semana que começa) entram as aulas para revisar. */
  reviewUntil: DateKey;
  /** O primeiro e o último dia da semana resumida. */
  firstDay: DateKey;
  lastDay: DateKey;
}

/**
 * A semana que o resumo de segunda cobre: de segunda a domingo da semana que passou, no fuso da
 * pessoa. `localDate` é a segunda de hoje. Para revisar, vale até o domingo da semana que começa.
 */
export function weeklyWindow(localDate: DateKey, timeZone: string): WeeklyWindow {
  const firstDay = addDays(localDate, -7);
  return {
    from: zonedInstant(firstDay, 0, 0, timeZone).toISOString(),
    to: zonedInstant(localDate, 0, 0, timeZone).toISOString(),
    reviewUntil: addDays(localDate, 6),
    firstDay,
    lastDay: addDays(localDate, -1),
  };
}

export interface WeeklyContent {
  rangeLabel: string;
  studied: DigestList;
  completed: DigestList;
  toReview: DigestList;
  /** Nada estudado, concluído nem para revisar: o e-mail não sai. */
  empty: boolean;
}

function studiedLine(event: DigestEvent, timeZone: string): DigestLine {
  const day = shortDay(localDateKey(event.occurredAt, timeZone));
  const parts = [event.detail, event.type === 'reviewed' ? 'revisão' : null, day];
  return { title: event.title, detail: parts.filter(Boolean).join(' · ') };
}

function completedLine(event: DigestEvent, timeZone: string): DigestLine {
  const kind = event.projectKind ? projectKindLabels[event.projectKind] : 'Projeto';
  return {
    title: event.title,
    detail: `${kind} · ${shortDay(localDateKey(event.occurredAt, timeZone))}`,
  };
}

function reviewLine(lesson: DueLesson, today: DateKey): DigestLine {
  let when: string;
  if (lesson.reviewOn === null) when = 'marcada para revisar';
  else if (lesson.reviewOn < today) when = `atrasada desde ${shortDay(lesson.reviewOn)}`;
  else if (lesson.reviewOn === today) when = 'hoje';
  else when = weekdayDay(lesson.reviewOn);
  return { title: lesson.title, detail: `${lesson.notebookTitle} · ${when}` };
}

/** Monta os blocos do resumo semanal só com os dados da Agenda (sem IA). */
export function buildWeeklyContent(
  data: DigestData,
  { localDate, timeZone }: { localDate: DateKey; timeZone: string },
): WeeklyContent {
  const week = weeklyWindow(localDate, timeZone);
  const studied = data.events
    .filter((event) => event.type === 'studied' || event.type === 'reviewed')
    .map((event) => studiedLine(event, timeZone));
  const completed = data.events
    .filter((event) => event.type === 'completed')
    .map((event) => completedLine(event, timeZone));
  const toReview = data.lessons.map((lesson) => reviewLine(lesson, localDate));
  return {
    rangeLabel: rangeLabel(week.firstDay, week.lastDay),
    studied: capList(studied),
    completed: capList(completed),
    toReview: capList(toReview),
    empty: studied.length === 0 && completed.length === 0 && toReview.length === 0,
  };
}

/** As aulas do lembrete de hoje (as de hoje e as atrasadas); vazio quando não há nenhuma. */
export function buildReminderContent(data: DigestData, localDate: DateKey): DigestList {
  return capList(data.lessons.map((lesson) => reviewLine(lesson, localDate)));
}

/**
 * Ponto de extensão para a IA (depois): recebe o conteúdo montado e devolve um parágrafo para o
 * alto do resumo, ou `null` para ficar só com a lista. Hoje ninguém o define.
 */
export type SummaryNarrator = (content: WeeklyContent) => Promise<string | null>;

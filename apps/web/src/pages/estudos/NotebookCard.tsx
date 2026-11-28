import { Link } from '@tanstack/react-router';
import { summarizeLessons, type DateKey, type Lesson, type NotebookProject } from '@trama/core';
import { cn } from '@trama/ui';
import { notebookColorClasses, notebookSubtitle } from './format';

/** O cartão de um caderno (tela 6): faixa na cor dele, nome, "12 aulas · 3 para revisar" e a barra. */
export function NotebookCard({
  notebook,
  lessons,
  today,
}: {
  notebook: NotebookProject;
  /** As aulas deste caderno. */
  lessons: Lesson[];
  today: DateKey;
}) {
  const summary = summarizeLessons(lessons, today);
  const color = notebookColorClasses[notebook.content.color];
  const percent = Math.round(summary.progress * 100);

  return (
    <Link
      to="/estudos/$notebookId"
      params={{ notebookId: notebook.id }}
      className="flex flex-col overflow-hidden rounded-block border border-border-subtle bg-surface transition-colors hover:border-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-selection"
    >
      <span aria-hidden className={cn('h-20', color.head)} />
      <span className="flex flex-col gap-1 p-5">
        <span className="truncate text-base font-semibold text-text-strong">{notebook.title}</span>
        <span className="text-[13px] text-text-muted">
          {notebookSubtitle(summary.total, summary.toReview)}
        </span>
        <span
          role="progressbar"
          aria-label={`Progresso de ${notebook.title}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="mt-3 block h-1 overflow-hidden rounded-full bg-hover"
        >
          <span
            className={cn('block h-full rounded-full transition-[width] duration-150', color.bar)}
            style={{ width: `${percent}%` }}
          />
        </span>
      </span>
    </Link>
  );
}

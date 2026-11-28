import { Link } from '@tanstack/react-router';
import { displayStatus, type DateKey, type Lesson, type NotebookProject } from '@trama/core';
import { LessonBadge } from './LessonBadge';
import { reviewLabel, studiedLabel } from './format';

const head = 'px-3 py-3 text-left text-[13px] font-normal text-text-muted';

/**
 * A tabela de aulas da tela 6 (aula, caderno, status, estudado em, revisar em), só para ler:
 * clicar no nome abre o caderno. Em tela estreita ficam o nome e o status.
 */
export function LessonTable({
  lessons,
  notebooks,
  today,
  timeZone,
  now,
  emptyText,
}: {
  lessons: Lesson[];
  notebooks: NotebookProject[];
  today: DateKey;
  timeZone: string;
  now: Date;
  emptyText: string;
}) {
  if (lessons.length === 0) return <p className="py-4 text-sm text-text-muted">{emptyText}</p>;
  const titleOf = new Map(notebooks.map((notebook) => [notebook.id, notebook.title]));

  return (
    <table className="w-full table-fixed border-collapse text-sm">
      <thead>
        <tr className="border-b border-border-subtle">
          <th scope="col" className={head}>
            Aula
          </th>
          <th scope="col" className={`${head} hidden w-40 md:table-cell`}>
            Caderno
          </th>
          <th scope="col" className={`${head} w-32`}>
            Status
          </th>
          <th scope="col" className={`${head} hidden w-40 sm:table-cell`}>
            Estudado em
          </th>
          <th scope="col" className={`${head} hidden w-28 sm:table-cell`}>
            Revisar em
          </th>
        </tr>
      </thead>
      <tbody>
        {lessons.map((lesson) => (
          <tr
            key={lesson.id}
            className="border-b border-border-subtle transition-colors hover:bg-hover/40"
          >
            <td className="px-3 py-3.5">
              <Link
                to="/estudos/$notebookId"
                params={{ notebookId: lesson.notebookId }}
                title={lesson.title}
                className="block truncate rounded-tag text-text-strong hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-selection"
              >
                {lesson.title}
              </Link>
              <span className="block truncate text-xs text-text-muted md:hidden">
                {titleOf.get(lesson.notebookId)}
              </span>
            </td>
            <td className="hidden truncate px-3 py-3.5 text-text-muted md:table-cell">
              {titleOf.get(lesson.notebookId)}
            </td>
            <td className="px-3 py-3.5">
              <LessonBadge status={displayStatus(lesson, today)} />
            </td>
            <td className="hidden px-3 py-3.5 text-text-muted tabular-nums sm:table-cell">
              {studiedLabel(lesson.studiedAt, timeZone, now, today)}
            </td>
            <td className="hidden px-3 py-3.5 text-text-muted tabular-nums sm:table-cell">
              {reviewLabel(lesson.reviewOn, today)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

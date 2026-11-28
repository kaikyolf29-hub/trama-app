import { lessonStatusLabels, type LessonStatus } from '@trama/core';
import { cn } from '@trama/ui';
import { lessonBadgeClasses } from './format';

/** O selo de status de uma aula. */
export function LessonBadge({ status, className }: { status: LessonStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-tag px-2 text-[13px] whitespace-nowrap',
        lessonBadgeClasses[status],
        className,
      )}
    >
      {lessonStatusLabels[status]}
    </span>
  );
}

import { Link, useNavigate, useParams } from '@tanstack/react-router';
import {
  displayStatus,
  lessonStatusLabels,
  lessonStatusSchema,
  markReviewed,
  markStudied,
  reorderLessons,
  summarizeLessons,
  todayKey,
  type Lesson,
  type LessonStatus,
  type NotebookProject,
  type UpdateLessonRequest,
} from '@trama/core';
import { Alert, Button, cn, Spinner } from '@trama/ui';
import { ChevronDownIcon, ChevronLeftIcon, ChevronUpIcon, TrashIcon } from '@trama/ui/icons';
import { useState, type FormEvent } from 'react';
import type { LessonsApi } from '../../api/lessons-api';
import type { NotebooksApi } from '../../api/notebooks-api';
import { useServices } from '../../services';
import { useProfile } from '../use-profile';
import { NotebookDialog, type NotebookForm } from './NotebookDialog';
import { StudiesShell } from './StudiesShell';
import {
  lessonBadgeClasses,
  notebookColorClasses,
  notebookSubtitle,
  reviewLabel,
  studiedLabel,
} from './format';
import { lessonsOf, useStudies } from './use-studies';

const iconButton =
  'inline-flex size-8 shrink-0 items-center justify-center rounded-control text-text-muted transition-colors hover:bg-hover hover:text-text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-selection disabled:cursor-not-allowed disabled:opacity-40';

const messageOf = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

/** Um caderno aberto: as aulas dele, com estudar, revisar, notas, ordem e apagar. */
export function NotebookPage() {
  const { notebooks, lessons } = useServices();
  if (!notebooks || !lessons) {
    return (
      <StudiesShell>
        <Alert tone="info">
          A API ainda não está ligada neste ambiente. Preencha VITE_API_URL em apps/web/.env.
        </Alert>
      </StudiesShell>
    );
  }
  return <NotebookContent notebooksApi={notebooks} lessonsApi={lessons} />;
}

function NotebookContent({
  notebooksApi,
  lessonsApi,
}: {
  notebooksApi: NotebooksApi;
  lessonsApi: LessonsApi;
}) {
  const { notebookId } = useParams({ from: '/estudos/$notebookId' });
  const { now } = useServices();
  const { timeZone, loading } = useProfile();
  const { data, retry, putNotebook, dropNotebook, putLessons, dropLesson } = useStudies(
    notebooksApi,
    lessonsApi,
  );
  const navigate = useNavigate();

  const ready = data.status === 'ready' ? data : null;
  const notebook = ready?.notebooks.find((item) => item.id === notebookId) ?? null;
  const sidebar = ready?.notebooks.map((item) => ({
    id: item.id,
    title: item.title,
    active: item.id === notebookId,
  }));

  return (
    <StudiesShell notebooks={sidebar}>
      <Link
        to="/estudos"
        className="-mb-4 inline-flex w-fit items-center gap-1 rounded-tag text-[13px] text-text-muted hover:text-text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-selection"
      >
        <ChevronLeftIcon aria-hidden className="size-4" />
        Estudos
      </Link>

      {data.status === 'failed' ? (
        <Alert tone="error">
          <p>{data.message}</p>
          <Button variant="secondary" className="mt-3" onClick={retry}>
            Tentar de novo
          </Button>
        </Alert>
      ) : !ready || loading ? (
        <p role="status" className="flex items-center gap-2.5 text-sm text-text-muted">
          <Spinner /> Carregando…
        </p>
      ) : !notebook ? (
        <Alert tone="info">
          Não achei este caderno. Ele pode ter sido apagado.{' '}
          <Link to="/estudos" className="font-medium underline underline-offset-4">
            Voltar para Estudos
          </Link>
        </Alert>
      ) : (
        <NotebookBody
          notebook={notebook}
          lessons={lessonsOf(ready.lessons, notebook.id)}
          notebooksApi={notebooksApi}
          lessonsApi={lessonsApi}
          timeZone={timeZone}
          now={now}
          onNotebook={putNotebook}
          onLessons={putLessons}
          onLessonGone={dropLesson}
          onNotebookGone={async () => {
            dropNotebook(notebook.id);
            await navigate({ to: '/estudos' });
          }}
        />
      )}
    </StudiesShell>
  );
}

function NotebookBody({
  notebook,
  lessons,
  notebooksApi,
  lessonsApi,
  timeZone,
  now,
  onNotebook,
  onLessons,
  onLessonGone,
  onNotebookGone,
}: {
  notebook: NotebookProject;
  lessons: Lesson[];
  notebooksApi: NotebooksApi;
  lessonsApi: LessonsApi;
  timeZone: string;
  now: () => Date;
  onNotebook: (notebook: NotebookProject) => void;
  onLessons: (lessons: Lesson[]) => void;
  onLessonGone: (id: string) => void;
  onNotebookGone: () => Promise<void>;
}) {
  const instant = now();
  const today = todayKey(instant, timeZone);
  const days = notebook.content.reviewAfterDays;
  const summary = summarizeLessons(lessons, today);
  const color = notebookColorClasses[notebook.content.color];
  const percent = Math.round(summary.progress * 100);

  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);

  /** Roda uma ação sobre uma aula: trava a linha, mostra o erro e devolve se deu certo. */
  const run = async (id: string, action: () => Promise<void>, fallback: string) => {
    setBusy(id);
    setError(null);
    setNotice(null);
    try {
      await action();
      return true;
    } catch (failure) {
      setError(messageOf(failure, fallback));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const patch = (lesson: Lesson, change: UpdateLessonRequest) =>
    run(
      lesson.id,
      async () => onLessons([await lessonsApi.update(notebook.id, lesson.id, change)]),
      'Não deu para salvar a aula.',
    );

  const studied = async (lesson: Lesson) => {
    const progress = markStudied(instant, days, timeZone);
    if (await patch(lesson, progress)) {
      setNotice(
        `"${lesson.title}" marcada como estudada. Revisão em ${reviewLabel(progress.reviewOn, today)}.`,
      );
    }
  };

  const reviewed = async (lesson: Lesson) => {
    const progress = markReviewed(instant, days, timeZone);
    if (await patch(lesson, progress)) {
      setNotice(
        `"${lesson.title}" revisada. Próxima revisão em ${reviewLabel(progress.reviewOn, today)}.`,
      );
    }
  };

  const setStatus = (lesson: Lesson, status: LessonStatus) => {
    // Escolher "Feito" numa aula que já passou do dia da revisão é revisá-la.
    if (status === 'done' && displayStatus(lesson, today) === 'review' && lesson.studiedAt) {
      return reviewed(lesson);
    }
    return patch(lesson, { status });
  };

  const move = (lesson: Lesson, direction: 'up' | 'down') => {
    const moves = reorderLessons(lessons, lesson.id, direction);
    if (moves.length === 0) return Promise.resolve(false);
    return run(
      lesson.id,
      async () =>
        onLessons(
          await Promise.all(
            moves.map((move) =>
              lessonsApi.update(notebook.id, move.id, { position: move.position }),
            ),
          ),
        ),
      'Não deu para mudar a ordem.',
    );
  };

  const remove = async (lesson: Lesson) =>
    run(
      lesson.id,
      async () => {
        await lessonsApi.remove(notebook.id, lesson.id);
        onLessonGone(lesson.id);
      },
      'Não deu para apagar a aula.',
    );

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title || adding) return;
    setAdding(true);
    setError(null);
    setNotice(null);
    try {
      onLessons([await lessonsApi.create(notebook.id, { title })]);
      setNewTitle('');
    } catch (failure) {
      setError(messageOf(failure, 'Não deu para adicionar a aula.'));
    } finally {
      setAdding(false);
    }
  };

  const saveNotebook = async (form: NotebookForm) => {
    onNotebook(
      await notebooksApi.update(notebook.id, {
        title: form.title,
        description: form.description,
        color: form.color,
        reviewAfterDays: form.reviewAfterDays,
      }),
    );
    setEditing(false);
    document.getElementById('editar-caderno')?.focus();
  };

  const removeNotebook = async () => {
    setRemoveBusy(true);
    setError(null);
    try {
      await notebooksApi.remove(notebook.id);
      await onNotebookGone();
    } catch (failure) {
      setError(messageOf(failure, 'Não deu para apagar o caderno.'));
      setRemoveBusy(false);
    }
  };

  return (
    <>
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <h1 className="min-w-0 font-serif text-4xl font-semibold break-words text-text-strong">
            {notebook.title}
          </h1>
          <div className="flex gap-2">
            <Button id="editar-caderno" variant="secondary" onClick={() => setEditing(true)}>
              Editar caderno
            </Button>
            <Button variant="secondary" onClick={() => setRemoving(true)} disabled={removing}>
              Apagar caderno
            </Button>
          </div>
        </div>
        {notebook.content.description && (
          <p className="max-w-3xl text-[15px] break-words whitespace-pre-line text-text-muted">
            {notebook.content.description}
          </p>
        )}
        <div className="flex max-w-md flex-col gap-2">
          <p className="text-[13px] text-text-muted">
            {notebookSubtitle(summary.total, summary.toReview)}
            {summary.total > 0 && ` · ${percent}% estudado`}
          </p>
          <span
            role="progressbar"
            aria-label="Progresso do caderno"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="block h-1 overflow-hidden rounded-full bg-hover"
          >
            <span
              className={cn('block h-full rounded-full transition-[width] duration-150', color.bar)}
              style={{ width: `${percent}%` }}
            />
          </span>
          <p className="text-[13px] text-text-muted">
            Cada aula volta para revisão {days === 1 ? '1 dia' : `${days} dias`} depois de estudada
            ou revisada.
          </p>
        </div>
      </header>

      {removing && (
        <div
          role="group"
          aria-label={`Apagar ${notebook.title}`}
          className="flex flex-wrap items-center justify-between gap-3 rounded-block border border-border bg-surface p-4"
        >
          <p className="min-w-0 text-text">
            Apagar <strong className="font-semibold text-text-strong">“{notebook.title}”</strong>?{' '}
            {lessons.length === 0
              ? ''
              : lessons.length === 1
                ? 'A aula dele some junto. '
                : `As ${lessons.length} aulas dele somem junto. `}
            Não dá para desfazer.
          </p>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="secondary"
              autoFocus
              onClick={() => setRemoving(false)}
              disabled={removeBusy}
            >
              Cancelar
            </Button>
            <Button onClick={() => void removeNotebook()} loading={removeBusy}>
              Apagar caderno
            </Button>
          </div>
        </div>
      )}

      {error && <Alert tone="error">{error}</Alert>}
      <p role="status" className="-my-4 min-h-5 text-[13px] text-done-text">
        {notice}
      </p>

      <form onSubmit={(event) => void add(event)} className="flex max-w-xl gap-2">
        <input
          aria-label="Nome da nova aula"
          placeholder="Nome da nova aula"
          value={newTitle}
          maxLength={200}
          autoComplete="off"
          onChange={(event) => setNewTitle(event.target.value)}
          className="h-9 min-w-0 flex-1 rounded-control border border-border bg-field px-3 text-sm text-text-strong outline-none placeholder:text-text-muted focus-visible:border-selection focus-visible:outline-1 focus-visible:outline-selection"
        />
        <Button type="submit" loading={adding} disabled={newTitle.trim() === ''}>
          Adicionar aula
        </Button>
      </form>

      {lessons.length === 0 ? (
        <p className="text-sm text-text-muted">
          Nenhuma aula ainda. Adicione a primeira acima e marque quando estudar.
        </p>
      ) : (
        <ul aria-label="Aulas" className="flex flex-col border-t border-border-subtle">
          <li
            aria-hidden
            className="hidden grid-cols-[72px_minmax(0,1fr)_128px_144px_96px_232px] gap-3 border-b border-border-subtle px-3 py-3 text-[13px] text-text-muted lg:grid"
          >
            <span />
            <span>Aula</span>
            <span>Status</span>
            <span>Estudado em</span>
            <span>Revisar em</span>
            <span />
          </li>
          {lessons.map((lesson, index) => (
            <LessonItem
              key={lesson.id}
              lesson={lesson}
              first={index === 0}
              last={index === lessons.length - 1}
              today={today}
              timeZone={timeZone}
              now={instant}
              disabled={busy === lesson.id}
              onStudied={() => void studied(lesson)}
              onReviewed={() => void reviewed(lesson)}
              onStatus={(status) => void setStatus(lesson, status)}
              onMove={(direction) => void move(lesson, direction)}
              onPatch={(change) => patch(lesson, change)}
              onRemove={() => remove(lesson)}
            />
          ))}
        </ul>
      )}

      {editing && (
        <NotebookDialog
          heading="Editar caderno"
          submitLabel="Salvar"
          initial={{
            title: notebook.title,
            description: notebook.content.description,
            color: notebook.content.color,
            reviewAfterDays: notebook.content.reviewAfterDays,
          }}
          onSave={saveNotebook}
          onClose={() => {
            setEditing(false);
            document.getElementById('editar-caderno')?.focus();
          }}
        />
      )}
    </>
  );
}

function LessonItem({
  lesson,
  first,
  last,
  today,
  timeZone,
  now,
  disabled,
  onStudied,
  onReviewed,
  onStatus,
  onMove,
  onPatch,
  onRemove,
}: {
  lesson: Lesson;
  first: boolean;
  last: boolean;
  today: string;
  timeZone: string;
  now: Date;
  disabled: boolean;
  onStudied: () => void;
  onReviewed: () => void;
  onStatus: (status: LessonStatus) => void;
  onMove: (direction: 'up' | 'down') => void;
  onPatch: (change: UpdateLessonRequest) => Promise<boolean>;
  onRemove: () => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const status = displayStatus(lesson, today);

  if (confirming) {
    return (
      <li className="border-b border-border-subtle px-3 py-3">
        <div
          role="group"
          aria-label={`Apagar ${lesson.title}`}
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <p className="min-w-0 text-text">
            Apagar <strong className="font-semibold text-text-strong">“{lesson.title}”</strong>? As
            notas dela somem e não dá para desfazer.
          </p>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="secondary"
              autoFocus
              onClick={() => setConfirming(false)}
              disabled={disabled}
            >
              Cancelar
            </Button>
            <Button
              loading={disabled}
              onClick={() =>
                void onRemove().then((done) => {
                  if (!done) return;
                  setConfirming(false);
                })
              }
            >
              Apagar
            </Button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className={cn('border-b border-border-subtle px-3 py-3', disabled && 'opacity-60')}>
      <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 lg:grid-cols-[72px_minmax(0,1fr)_128px_144px_96px_232px]">
        <div className="flex">
          <button
            type="button"
            className={iconButton}
            aria-label={`Subir "${lesson.title}"`}
            disabled={disabled || first}
            onClick={() => onMove('up')}
          >
            <ChevronUpIcon aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            className={iconButton}
            aria-label={`Descer "${lesson.title}"`}
            disabled={disabled || last}
            onClick={() => onMove('down')}
          >
            <ChevronDownIcon aria-hidden className="size-4" />
          </button>
        </div>

        <button
          type="button"
          aria-expanded={open}
          aria-label={`${open ? 'Fechar' : 'Abrir'} detalhes de ${lesson.title}`}
          onClick={() => setOpen((value) => !value)}
          className="min-w-0 truncate rounded-tag text-left text-text-strong hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-selection"
        >
          {lesson.title}
        </button>

        <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-0 lg:contents">
          <select
            aria-label={`Status de ${lesson.title}`}
            value={status}
            disabled={disabled}
            onChange={(event) => onStatus(lessonStatusSchema.parse(event.target.value))}
            className={cn(
              'h-6 w-fit rounded-tag border-0 px-2 text-[13px] focus-visible:outline-2 focus-visible:outline-selection',
              lessonBadgeClasses[status],
            )}
          >
            {lessonStatusSchema.options.map((option) => (
              <option key={option} value={option} className="bg-floating text-text">
                {lessonStatusLabels[option]}
              </option>
            ))}
          </select>
          <span className="text-[13px] text-text-muted tabular-nums">
            <span className="lg:hidden">Estudada: </span>
            {studiedLabel(lesson.studiedAt, timeZone, now, today)}
          </span>
          <span className="text-[13px] text-text-muted tabular-nums">
            <span className="lg:hidden">Revisar: </span>
            {reviewLabel(lesson.reviewOn, today)}
          </span>
        </div>
        <div className="col-span-2 flex flex-wrap items-center gap-2 lg:col-span-1 lg:justify-end">
          {lesson.studiedAt === null ? (
            <Button
              variant="secondary"
              disabled={disabled}
              aria-label={`Marcar como estudada: ${lesson.title}`}
              onClick={onStudied}
            >
              Marcar como estudada
            </Button>
          ) : (
            <Button
              variant="secondary"
              disabled={disabled}
              aria-label={`Revisei: ${lesson.title}`}
              onClick={onReviewed}
            >
              Revisei
            </Button>
          )}
          <button
            type="button"
            className={iconButton}
            aria-label={`Apagar a aula "${lesson.title}"`}
            title="Apagar"
            disabled={disabled}
            onClick={() => setConfirming(true)}
          >
            <TrashIcon aria-hidden className="size-4" />
          </button>
        </div>
      </div>

      {open && <LessonDetails lesson={lesson} disabled={disabled} onPatch={onPatch} />}
    </li>
  );
}

/** Nome e notas da aula; cada campo grava ao sair dele, se mudou. */
function LessonDetails({
  lesson,
  disabled,
  onPatch,
}: {
  lesson: Lesson;
  disabled: boolean;
  onPatch: (change: UpdateLessonRequest) => Promise<boolean>;
}) {
  const [title, setTitle] = useState(lesson.title);
  const [notes, setNotes] = useState(lesson.notes);

  const saveTitle = async () => {
    const next = title.trim();
    if (next === '') return setTitle(lesson.title);
    if (next !== lesson.title) {
      if (!(await onPatch({ title: next }))) setTitle(lesson.title);
    }
  };
  const saveNotes = async () => {
    if (notes !== lesson.notes) await onPatch({ notes });
  };

  return (
    <div className="mt-3 flex flex-col gap-3 lg:pl-[84px]">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`nome-${lesson.id}`} className="text-[13px] font-medium text-text">
          Nome da aula
        </label>
        <input
          id={`nome-${lesson.id}`}
          value={title}
          maxLength={200}
          disabled={disabled}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => void saveTitle()}
          className="h-9 rounded-control border border-border bg-field px-3 text-sm text-text-strong outline-none focus-visible:border-selection focus-visible:outline-1 focus-visible:outline-selection"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`notas-${lesson.id}`} className="text-[13px] font-medium text-text">
          Notas da aula
        </label>
        <textarea
          id={`notas-${lesson.id}`}
          value={notes}
          rows={5}
          maxLength={20000}
          disabled={disabled}
          placeholder="O que você aprendeu, dúvidas, links..."
          onChange={(event) => setNotes(event.target.value)}
          onBlur={() => void saveNotes()}
          className="resize-y rounded-control border border-border bg-field px-3 py-2 text-sm text-text-strong outline-none placeholder:text-text-muted focus-visible:border-selection focus-visible:outline-1 focus-visible:outline-selection"
        />
        <p className="text-[13px] text-text-muted">
          As notas salvam sozinhas quando você sai do campo.
        </p>
      </div>
    </div>
  );
}

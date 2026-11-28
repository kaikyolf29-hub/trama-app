import { useNavigate } from '@tanstack/react-router';
import {
  lessonsToReview,
  todayKey,
  type Lesson,
  type NotebookProject,
  type Profile,
} from '@trama/core';
import { Alert, Button, cn, Spinner } from '@trama/ui';
import { PlusIcon, StudyIcon } from '@trama/ui/icons';
import { useId, useMemo, useState, type ReactNode } from 'react';
import type { AccountApi } from '../../api/account-api';
import type { LessonsApi } from '../../api/lessons-api';
import type { NotebooksApi } from '../../api/notebooks-api';
import { useServices } from '../../services';
import { useProfile } from '../use-profile';
import { LessonTable } from './LessonTable';
import { NotebookCard } from './NotebookCard';
import { NotebookDialog, type NotebookForm } from './NotebookDialog';
import { StudiesShell } from './StudiesShell';
import { lessonsOf, useStudies } from './use-studies';

type Tab = 'notebooks' | 'lessons' | 'reviews';

/** As últimas aulas que a aba "Cadernos" mostra abaixo dos cartões. */
const RECENT_LESSONS = 5;

const NEW_NOTEBOOK: NotebookForm = {
  title: '',
  description: '',
  color: 'blue',
  reviewAfterDays: 7,
};

/**
 * Estudos (tela 6): os cadernos em cartões, a tabela com todas as aulas e as revisões do dia.
 * Cada caderno abre numa tela própria (`/estudos/<id>`).
 */
export function StudiesPage() {
  const { notebooks, lessons } = useServices();
  if (!notebooks || !lessons) {
    return (
      <StudiesShell cover>
        <Heading />
        <Alert tone="info">
          A API ainda não está ligada neste ambiente. Preencha VITE_API_URL em apps/web/.env.
        </Alert>
      </StudiesShell>
    );
  }
  return <StudiesContent notebooksApi={notebooks} lessonsApi={lessons} />;
}

export function StudiesIcon() {
  return (
    <div
      aria-hidden
      className="-mt-8 flex size-16 items-center justify-center rounded-block bg-brand-paper text-brand-ink shadow-block md:-mt-10 md:size-[68px]"
    >
      <StudyIcon className="size-8" />
    </div>
  );
}

function Heading({ children }: { children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4">
      <StudiesIcon />
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <h1 className="font-serif text-4xl font-semibold text-text-strong md:text-5xl">Estudos</h1>
        {children}
      </div>
      <p className="max-w-3xl text-[15px] text-text-muted">
        Tudo que você está aprendendo, organizado por caderno. Toda segunda chega no seu e-mail o
        que você estudou e o que revisar.
      </p>
    </header>
  );
}

function StudiesContent({
  notebooksApi,
  lessonsApi,
}: {
  notebooksApi: NotebooksApi;
  lessonsApi: LessonsApi;
}) {
  const { now } = useServices();
  const { account, profile, timeZone, loading, setProfile } = useProfile();
  const { data, retry, putNotebook } = useStudies(notebooksApi, lessonsApi);
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('notebooks');
  const [creating, setCreating] = useState(false);

  const instant = now();
  const today = todayKey(instant, timeZone);
  const ready = data.status === 'ready' ? data : null;

  const ordered = useMemo(() => {
    if (!ready) return [];
    const index = new Map(ready.notebooks.map((notebook, i) => [notebook.id, i]));
    return [...ready.lessons].sort(
      (a, b) =>
        (index.get(a.notebookId) ?? 0) - (index.get(b.notebookId) ?? 0) ||
        a.position - b.position ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    );
  }, [ready]);
  const toReview = useMemo(
    () => (ready ? lessonsToReview(ready.lessons, today) : []),
    [ready, today],
  );
  // As últimas aulas mexidas (estudadas ou revisadas), da mais recente para a mais antiga.
  const recent = useMemo(() => {
    const lastActivity = (lesson: Lesson) =>
      [lesson.studiedAt, lesson.reviewedAt]
        .filter((at) => at !== null)
        .sort()
        .at(-1) ?? '';
    return (ready?.lessons ?? [])
      .filter((lesson) => lastActivity(lesson) !== '')
      .sort((a, b) => lastActivity(b).localeCompare(lastActivity(a)))
      .slice(0, RECENT_LESSONS);
  }, [ready]);

  const create = async (form: NotebookForm) => {
    const notebook = await notebooksApi.create({
      title: form.title,
      content: {
        description: form.description,
        color: form.color,
        reviewAfterDays: form.reviewAfterDays,
      },
    });
    putNotebook(notebook);
    setCreating(false);
    await navigate({ to: '/estudos/$notebookId', params: { notebookId: notebook.id } });
  };

  const closeDialog = () => {
    setCreating(false);
    document.getElementById('novo-caderno')?.focus();
  };

  return (
    <StudiesShell
      cover
      notebooks={ready?.notebooks.map((notebook) => ({ id: notebook.id, title: notebook.title }))}
    >
      <Heading>
        {account && profile && (
          <WeeklySummaryToggle account={account} profile={profile} onProfile={setProfile} />
        )}
      </Heading>

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
      ) : (
        <>
          <Tabs
            tab={tab}
            onTab={setTab}
            reviews={toReview.length}
            onNew={() => setCreating(true)}
          />

          {tab === 'notebooks' && (
            <div role="tabpanel" aria-label="Cadernos" className="flex flex-col gap-8">
              <NotebookGrid notebooks={ready.notebooks} lessons={ready.lessons} today={today} />
              {recent.length > 0 && (
                <section aria-labelledby="ultimas-aulas" className="flex flex-col gap-2">
                  <h2 id="ultimas-aulas" className="text-sm text-text-muted">
                    Últimas aulas
                  </h2>
                  <LessonTable
                    lessons={recent}
                    notebooks={ready.notebooks}
                    today={today}
                    timeZone={timeZone}
                    now={instant}
                    emptyText=""
                  />
                </section>
              )}
            </div>
          )}

          {tab === 'lessons' && (
            <div role="tabpanel" aria-label="Todas as aulas">
              <LessonTable
                lessons={ordered}
                notebooks={ready.notebooks}
                today={today}
                timeZone={timeZone}
                now={instant}
                emptyText="Nenhuma aula ainda. Abra um caderno e adicione a primeira."
              />
            </div>
          )}

          {tab === 'reviews' && (
            <div role="tabpanel" aria-label="Revisões">
              <LessonTable
                lessons={toReview}
                notebooks={ready.notebooks}
                today={today}
                timeZone={timeZone}
                now={instant}
                emptyText="Nada para revisar hoje. Quando a data de revisão de uma aula chegar, ela aparece aqui."
              />
            </div>
          )}
        </>
      )}

      {creating && (
        <NotebookDialog
          heading="Novo caderno"
          submitLabel="Criar caderno"
          initial={NEW_NOTEBOOK}
          onSave={create}
          onClose={closeDialog}
        />
      )}
    </StudiesShell>
  );
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'notebooks', label: 'Cadernos' },
  { id: 'lessons', label: 'Todas as aulas' },
  { id: 'reviews', label: 'Revisões' },
];

function Tabs({
  tab,
  onTab,
  reviews,
  onNew,
}: {
  tab: Tab;
  onTab: (tab: Tab) => void;
  reviews: number;
  onNew: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border-subtle">
      <div role="tablist" aria-label="Estudos" className="flex max-w-full gap-1 overflow-x-auto">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => onTab(id)}
            className={cn(
              '-mb-px flex h-10 shrink-0 items-center gap-2 border-b-2 px-3.5 whitespace-nowrap text-[15px] transition-colors focus-visible:outline-2 focus-visible:outline-selection',
              tab === id
                ? 'border-text-strong text-text-strong'
                : 'border-transparent text-text-muted hover:text-text-strong',
            )}
          >
            {label}
            {id === 'reviews' && reviews > 0 && (
              <span className="rounded-tag bg-note-yellow-bg px-1.5 text-xs text-note-yellow-fg">
                {reviews}
              </span>
            )}
          </button>
        ))}
      </div>
      <Button id="novo-caderno" variant="secondary" className="mb-2 sm:mb-0" onClick={onNew}>
        <PlusIcon aria-hidden className="size-4" />
        Novo caderno
      </Button>
    </div>
  );
}

function NotebookGrid({
  notebooks,
  lessons,
  today,
}: {
  notebooks: NotebookProject[];
  lessons: Lesson[];
  today: string;
}) {
  return (
    <section aria-label="Cadernos" className="flex flex-col gap-4">
      {notebooks.length === 0 && (
        <p className="text-sm text-text-muted">
          Você ainda não tem cadernos. Crie o primeiro para guardar as aulas que está estudando.
        </p>
      )}
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {notebooks.map((notebook) => (
          <li key={notebook.id} className="flex flex-col">
            <NotebookCard
              notebook={notebook}
              lessons={lessonsOf(lessons, notebook.id)}
              today={today}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Resumo semanal por e-mail" da tela 6: liga e desliga a preferência do perfil, na hora. */
function WeeklySummaryToggle({
  account,
  profile,
  onProfile,
}: {
  account: AccountApi;
  profile: Profile;
  onProfile: (profile: Profile) => void;
}) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const on = profile.emailPreferences.weeklySummary;

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      onProfile(await account.updateProfile({ emailPreferences: { weeklySummary: !on } }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não deu para salvar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex h-11 items-center gap-3 rounded-control border border-border-subtle bg-surface px-4">
        <span id={id} className="text-[15px] text-text">
          Resumo semanal por e-mail
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby={id}
          disabled={busy}
          onClick={() => void toggle()}
          className={cn(
            'relative h-6 w-10 shrink-0 rounded-full border transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-selection',
            'disabled:cursor-not-allowed disabled:opacity-60',
            on ? 'border-text-strong bg-text-strong' : 'border-border bg-hover',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'absolute top-0.5 size-4 rounded-full transition-[left] duration-150',
              on ? 'left-[20px] bg-brand-ink' : 'left-0.5 bg-text-muted',
            )}
          />
        </button>
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-note-pink-fg">
          {error}
        </p>
      )}
    </div>
  );
}

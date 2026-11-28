import { createClient } from '@supabase/supabase-js';
import {
  MAX_EVENTS_PER_QUERY,
  type AgendaEvent,
  type EventSource,
  type EventType,
  type Lesson,
  type LessonStatus,
  type ProjectKind,
} from '@trama/core';
import { check, iso } from '../projects/supabase-store';

/** A API devolve no máximo isto de uma vez (cabe com folga na tabela de uma pessoa). */
const MAX_LESSONS_PER_QUERY = 5000;
import type { OrganizationStore } from './store';

interface EventRow {
  id: string;
  type: EventType;
  occurred_at: string;
  project_id: string | null;
  project_kind: ProjectKind | null;
  lesson_id: string | null;
  title: string;
  detail: string | null;
  source: EventSource;
  created_at: string;
}

interface LessonRow {
  id: string;
  notebook_id: string;
  title: string;
  notes: string;
  status: LessonStatus;
  studied_at: string | null;
  reviewed_at: string | null;
  review_on: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

const EVENT_COLUMNS =
  'id, type, occurred_at, project_id, project_kind, lesson_id, title, detail, source, created_at';
const LESSON_COLUMNS =
  'id, notebook_id, title, notes, status, studied_at, reviewed_at, review_on, position, created_at, updated_at';

function toEvent(row: EventRow): AgendaEvent {
  return {
    id: row.id,
    type: row.type,
    occurredAt: iso(row.occurred_at),
    projectId: row.project_id,
    projectKind: row.project_kind,
    lessonId: row.lesson_id,
    title: row.title,
    detail: row.detail,
    source: row.source,
    createdAt: iso(row.created_at),
  };
}

function toLesson(row: LessonRow): Lesson {
  return {
    id: row.id,
    notebookId: row.notebook_id,
    title: row.title,
    notes: row.notes,
    status: row.status,
    studiedAt: row.studied_at === null ? null : iso(row.studied_at),
    reviewedAt: row.reviewed_at === null ? null : iso(row.reviewed_at),
    reviewOn: row.review_on,
    position: row.position,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

/** Só os campos que vieram no corpo; `null` limpa uma data. */
function lessonColumns(input: {
  title?: string | undefined;
  notes?: string | undefined;
  status?: LessonStatus | undefined;
  studiedAt?: string | null | undefined;
  reviewedAt?: string | null | undefined;
  reviewOn?: string | null | undefined;
  position?: number | undefined;
}): Record<string, unknown> {
  const columns: Record<string, unknown> = {
    title: input.title,
    notes: input.notes,
    status: input.status,
    studied_at: input.studiedAt,
    reviewed_at: input.reviewedAt,
    review_on: input.reviewOn,
    position: input.position,
  };
  return Object.fromEntries(Object.entries(columns).filter(([, value]) => value !== undefined));
}

/**
 * Eventos e aulas no Supabase, com a chave publicável e o token da pessoa: o banco aplica a RLS
 * como se fosse ela (e os gatilhos gravam os eventos automáticos).
 */
export function createSupabaseOrganizationStore(
  url: string,
  publishableKey: string,
  token: string,
): OrganizationStore {
  const supabase = createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  /** O caderno existe para esta pessoa e é mesmo um caderno? */
  async function notebookExists(id: string): Promise<boolean> {
    const { data, error, status } = await supabase
      .from('projects')
      .select('id')
      .eq('id', id)
      .eq('kind', 'notebook')
      .returns<{ id: string }[]>()
      .maybeSingle();
    check(error, status);
    return data !== null;
  }

  return {
    async list({ from, to }) {
      const { data, error, status } = await supabase
        .from('events')
        .select(EVENT_COLUMNS)
        .gte('occurred_at', from)
        .lt('occurred_at', to)
        .order('occurred_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(MAX_EVENTS_PER_QUERY)
        .returns<EventRow[]>();
      check(error, status);
      return (data ?? []).map(toEvent);
    },

    async createNote({ title, detail, occurredAt, projectId }) {
      let projectKind: ProjectKind | null = null;
      if (projectId) {
        const { data, error, status } = await supabase
          .from('projects')
          .select('kind')
          .eq('id', projectId)
          .returns<{ kind: ProjectKind }[]>()
          .maybeSingle();
        check(error, status);
        if (!data) return null;
        projectKind = data.kind;
      }
      const { data, error, status } = await supabase
        .from('events')
        .insert({
          type: 'note',
          source: 'manual',
          title,
          detail: detail && detail !== '' ? detail : null,
          occurred_at: occurredAt,
          project_id: projectId ?? null,
          project_kind: projectKind,
        })
        .select(EVENT_COLUMNS)
        .returns<EventRow[]>()
        .single();
      check(error, status);
      if (!data) throw new Error('Supabase não devolveu a anotação criada');
      return toEvent(data);
    },

    async remove(id) {
      const found = await supabase
        .from('events')
        .select('id, source')
        .eq('id', id)
        .returns<{ id: string; source: EventSource }[]>()
        .maybeSingle();
      check(found.error, found.status);
      if (!found.data) return 'not_found';
      if (found.data.source !== 'manual') return 'not_manual';
      const { error, status } = await supabase.from('events').delete().eq('id', id);
      check(error, status);
      return 'removed';
    },

    lessons: {
      async listAll() {
        const { data, error, status } = await supabase
          .from('lessons')
          .select(LESSON_COLUMNS)
          .order('notebook_id', { ascending: true })
          .order('position', { ascending: true })
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .limit(MAX_LESSONS_PER_QUERY)
          .returns<LessonRow[]>();
        check(error, status);
        return (data ?? []).map(toLesson);
      },

      async list(notebookId) {
        if (!(await notebookExists(notebookId))) return null;
        const { data, error, status } = await supabase
          .from('lessons')
          .select(LESSON_COLUMNS)
          .eq('notebook_id', notebookId)
          .order('position', { ascending: true })
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .returns<LessonRow[]>();
        check(error, status);
        return (data ?? []).map(toLesson);
      },

      async create(notebookId, input) {
        if (!(await notebookExists(notebookId))) return null;
        let position = input.position;
        if (position === undefined) {
          // Sem posição, vai para o fim do caderno.
          const last = await supabase
            .from('lessons')
            .select('position')
            .eq('notebook_id', notebookId)
            .order('position', { ascending: false })
            .limit(1)
            .returns<{ position: number }[]>();
          check(last.error, last.status);
          const top = last.data?.[0]?.position;
          position = top === undefined ? 0 : top + 1;
        }
        const { data, error, status } = await supabase
          .from('lessons')
          .insert({ ...lessonColumns({ ...input, position }), notebook_id: notebookId })
          .select(LESSON_COLUMNS)
          .returns<LessonRow[]>()
          .single();
        check(error, status);
        if (!data) throw new Error('Supabase não devolveu a aula criada');
        return toLesson(data);
      },

      async update(notebookId, lessonId, patch) {
        const { data, error, status } = await supabase
          .from('lessons')
          .update(lessonColumns(patch))
          .eq('id', lessonId)
          .eq('notebook_id', notebookId)
          .select(LESSON_COLUMNS)
          .returns<LessonRow[]>();
        check(error, status);
        const row = data?.[0];
        return row ? toLesson(row) : null;
      },

      async remove(notebookId, lessonId) {
        const { data, error, status } = await supabase
          .from('lessons')
          .delete()
          .eq('id', lessonId)
          .eq('notebook_id', notebookId)
          .select('id')
          .returns<{ id: string }[]>();
        check(error, status);
        return (data ?? []).length > 0;
      },
    },
  };
}

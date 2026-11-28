import type { AgendaEvent, CreateLessonRequest, Lesson, UpdateLessonRequest } from '@trama/core';

/** Anotação já resolvida pela rota (data escolhida ou agora), pronta para gravar. */
export interface NoteInput {
  title: string;
  detail?: string | undefined;
  occurredAt: string;
  projectId?: string | undefined;
}

/** Resultado de apagar um evento: só anotações feitas à mão se apagam. */
export type RemoveEventResult = 'removed' | 'not_found' | 'not_manual';

/**
 * Eventos da Agenda do ponto de vista das rotas. Os automáticos o banco grava sozinho (gatilhos
 * em `supabase/migrations/..._agenda_aulas.sql`); aqui só se lê e se anota à mão.
 */
export interface EventStore {
  /** Eventos de `from` (incluído) até `to` (excluído), do mais antigo ao mais novo. */
  list(range: { from: string; to: string }): Promise<AgendaEvent[]>;
  /** `null`: o projeto citado não existe para esta pessoa. */
  createNote(input: NoteInput): Promise<AgendaEvent | null>;
  remove(id: string): Promise<RemoveEventResult>;
}

/** Aulas de um caderno. `null` quer dizer "este caderno não existe para esta pessoa". */
export interface LessonStore {
  list(notebookId: string): Promise<Lesson[] | null>;
  create(notebookId: string, input: CreateLessonRequest): Promise<Lesson | null>;
  update(notebookId: string, lessonId: string, patch: UpdateLessonRequest): Promise<Lesson | null>;
  remove(notebookId: string, lessonId: string): Promise<boolean>;
}

export interface OrganizationStore extends EventStore {
  lessons: LessonStore;
}

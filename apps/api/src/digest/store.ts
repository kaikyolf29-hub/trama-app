import type { DateKey, EmailPreferences, ProjectKind } from '@trama/core';

/** Os dois e-mails de estudo: o resumo de segunda e o lembrete diário. */
export type DigestKind = 'weekly_summary' | 'review_reminder';

/** Qual preferência de e-mail (`profiles.email_preferences`) liga cada tipo. */
export const preferenceOf: Record<DigestKind, keyof EmailPreferences> = {
  weekly_summary: 'weeklySummary',
  review_reminder: 'reviewReminders',
};

/** Quem deve receber o e-mail agora (o banco escolhe pelo fuso e pela preferência). */
export interface Candidate {
  userId: string;
  email: string;
  name: string;
  timezone: string;
  /** O dia, no fuso da pessoa. */
  localDate: DateKey;
}

/** Um evento da semana: aula estudada, aula revisada ou projeto concluído. */
export interface DigestEvent {
  type: 'studied' | 'reviewed' | 'completed';
  occurredAt: string;
  projectKind: ProjectKind | null;
  /** Título da aula ou do projeto. */
  title: string;
  /** Para uma aula, o nome do caderno. */
  detail: string | null;
}

/** Uma aula para revisar. */
export interface DueLesson {
  title: string;
  notebookTitle: string;
  status: 'studying' | 'review' | 'done';
  /** Dia da revisão; null quando o selo "Revisar" foi posto à mão. */
  reviewOn: DateKey | null;
}

export interface DigestData {
  events: DigestEvent[];
  lessons: DueLesson[];
}

/** 'claimed' pode enviar; 'duplicate' já foi; 'limit' o dia chegou ao máximo do plano. */
export type ClaimResult = 'claimed' | 'duplicate' | 'limit';

/**
 * O que a tarefa agendada e o descadastro leem e gravam. Não há token de pessoa aqui: a versão
 * de verdade usa a chave secreta do Supabase e SÓ chama as funções do banco que a migration
 * `..._emails_estudos.sql` libera para a `service_role` (cada uma devolve o mínimo). Os testes
 * usam a versão em memória.
 */
export interface DigestStore {
  /** Até `limit` pessoas que devem receber `kind` agora (8h a 10h59 no fuso, preferência ligada). */
  candidates(kind: DigestKind, now: Date, limit: number): Promise<Candidate[]>;
  /** Reserva o envio (uma vez por pessoa, tipo e dia) e confere o limite diário. */
  claim(
    userId: string,
    kind: DigestKind,
    localDate: DateKey,
    dailyLimit: number,
  ): Promise<ClaimResult>;
  /** Desfaz a reserva quando o envio falhou. */
  release(userId: string, kind: DigestKind, localDate: DateKey): Promise<void>;
  /**
   * Eventos de `from` (incluído) a `to` (excluído) e as aulas para revisar até `reviewUntil`,
   * numa chamada só.
   */
  data(
    userId: string,
    range: { from: string; to: string; reviewUntil: DateKey },
  ): Promise<DigestData>;
  /** Liga ou desliga uma preferência; devolve se a pessoa existe. */
  setPreference(userId: string, key: keyof EmailPreferences, value: boolean): Promise<boolean>;
}

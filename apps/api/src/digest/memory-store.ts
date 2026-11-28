import { DEFAULT_EMAIL_PREFERENCES, type EmailPreferences } from '@trama/core';
import {
  preferenceOf,
  type Candidate,
  type ClaimResult,
  type DigestData,
  type DigestKind,
  type DigestStore,
} from './store';

/**
 * Armazém em memória para os testes: quem é candidato vem pronto (`due`, a escolha por fuso e
 * hora é do banco e tem teste SQL próprio), e as reservas, o limite do dia, as preferências e as
 * chamadas ficam anotados. Guarda os pedidos para os testes contarem as chamadas ao banco.
 */
export function createMemoryDigestStore(options: { dailyLimit?: number } = {}) {
  /** Candidatos por tipo, na ordem em que o banco devolveria. */
  const due: Record<DigestKind, Candidate[]> = { weekly_summary: [], review_reminder: [] };
  /** Dados do e-mail de cada pessoa. */
  const dataByUser = new Map<string, DigestData>();
  const preferences = new Map<string, EmailPreferences>();
  const claims = new Set<string>();
  const key = (userId: string, kind: DigestKind, localDate: string) =>
    `${userId}|${kind}|${localDate}`;
  const calls: string[] = [];
  const dataRequests: { userId: string; from: string; to: string; reviewUntil: string }[] = [];
  /** Pessoas cujo envio já tem reserva, para o teste de "não manda duas vezes". */
  let failNext: string | null = null;

  const check = (name: string) => {
    if (failNext === name) {
      failNext = null;
      throw new Error(`Supabase (${name}): falha simulada`);
    }
  };

  const store: DigestStore = {
    candidates(kind, _now, limit) {
      calls.push('candidates');
      check('candidates');
      return Promise.resolve(
        due[kind].filter((c) => !claims.has(key(c.userId, kind, c.localDate))).slice(0, limit),
      );
    },
    claim(userId, kind, localDate, dailyLimit): Promise<ClaimResult> {
      calls.push('claim');
      check('claim');
      if (claims.size >= (options.dailyLimit ?? dailyLimit)) return Promise.resolve('limit');
      const k = key(userId, kind, localDate);
      if (claims.has(k)) return Promise.resolve('duplicate');
      claims.add(k);
      return Promise.resolve('claimed');
    },
    release(userId, kind, localDate) {
      calls.push('release');
      claims.delete(key(userId, kind, localDate));
      return Promise.resolve();
    },
    data(userId, range) {
      calls.push('data');
      check('data');
      dataRequests.push({ userId, ...range });
      return Promise.resolve(dataByUser.get(userId) ?? { events: [], lessons: [] });
    },
    setPreference(userId, preference, value) {
      calls.push('setPreference');
      const current = preferences.get(userId);
      if (!current) return Promise.resolve(false);
      preferences.set(userId, { ...current, [preference]: value });
      return Promise.resolve(true);
    },
  };

  return {
    store,
    due,
    dataByUser,
    preferences,
    claims,
    calls,
    dataRequests,
    /** A próxima chamada deste método (`candidates`, `claim`, `data`) falha. */
    failNext: (name: string) => {
      failNext = name;
    },
    /** Cadastra uma pessoa com as preferências de fábrica. */
    addPerson: (userId: string, prefs: Partial<EmailPreferences> = {}) =>
      preferences.set(userId, { ...DEFAULT_EMAIL_PREFERENCES, ...prefs }),
    /** A preferência (`weekly_summary` → `weeklySummary`) de uma pessoa. */
    preferenceOf: (userId: string, kind: DigestKind) =>
      preferences.get(userId)?.[preferenceOf[kind]],
  };
}

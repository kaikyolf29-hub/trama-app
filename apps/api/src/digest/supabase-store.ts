import { createClient } from '@supabase/supabase-js';
import { dateKeySchema, projectKindSchema } from '@trama/core';
import { z } from 'zod';
import type { ClaimResult, DigestStore } from './store';

const candidateRows = z.array(
  z.object({
    user_id: z.uuid(),
    email: z.string().min(1),
    name: z.string(),
    timezone: z.string().min(1),
    local_date: dateKeySchema,
  }),
);

const dataRow = z.object({
  events: z.array(
    z.object({
      type: z.enum(['studied', 'reviewed', 'completed']),
      occurred_at: z.string().min(1),
      project_kind: projectKindSchema.nullable(),
      title: z.string(),
      detail: z.string().nullable(),
    }),
  ),
  lessons: z.array(
    z.object({
      title: z.string(),
      notebook_title: z.string(),
      status: z.enum(['studying', 'review', 'done']),
      review_on: dateKeySchema.nullable(),
    }),
  ),
});

const claimResult = z.enum(['claimed', 'duplicate', 'limit']);

/** Erro sem dado pessoal: só o nome da função e o código do banco. */
function fail(name: string, error: { code?: string }): never {
  throw new Error(`Supabase (${name}): ${error.code ?? 'erro'}`);
}

/**
 * Lê e grava pela chave secreta do Supabase, SÓ pelas funções `email_candidates`, `claim_email`,
 * `release_email`, `digest_data` e `set_email_preference` (a chave ignora a RLS, então nunca se
 * consulta uma tabela direto aqui). Toda resposta passa por um esquema zod.
 */
export function createSupabaseDigestStore(
  url: string,
  secretKey: string,
  fetcher?: typeof fetch,
): DigestStore {
  const supabase = createClient(url, secretKey, {
    ...(fetcher ? { global: { fetch: fetcher } } : {}),
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  return {
    async candidates(kind, now, limit) {
      const result = await supabase.rpc('email_candidates', {
        p_kind: kind,
        p_now: now.toISOString(),
        p_limit: limit,
      });
      const { error } = result;
      const data: unknown = result.data;
      if (error) fail('email_candidates', error);
      return candidateRows.parse(data ?? []).map((row) => ({
        userId: row.user_id,
        email: row.email,
        name: row.name,
        timezone: row.timezone,
        localDate: row.local_date,
      }));
    },

    async claim(userId, kind, localDate, dailyLimit) {
      const result = await supabase.rpc('claim_email', {
        p_user: userId,
        p_kind: kind,
        p_local_date: localDate,
        p_daily_limit: dailyLimit,
      });
      const { error } = result;
      const data: unknown = result.data;
      if (error) fail('claim_email', error);
      return claimResult.parse(data) satisfies ClaimResult;
    },

    async release(userId, kind, localDate) {
      const { error } = await supabase.rpc('release_email', {
        p_user: userId,
        p_kind: kind,
        p_local_date: localDate,
      });
      if (error) fail('release_email', error);
    },

    async data(userId, { from, to, reviewUntil }) {
      const result = await supabase.rpc('digest_data', {
        p_user: userId,
        p_from: from,
        p_to: to,
        p_review_until: reviewUntil,
      });
      const { error } = result;
      const data: unknown = result.data;
      if (error) fail('digest_data', error);
      const row = dataRow.parse(data);
      return {
        events: row.events.map((event) => ({
          type: event.type,
          occurredAt: new Date(event.occurred_at).toISOString(),
          projectKind: event.project_kind,
          title: event.title,
          detail: event.detail,
        })),
        lessons: row.lessons.map((lesson) => ({
          title: lesson.title,
          notebookTitle: lesson.notebook_title,
          status: lesson.status,
          reviewOn: lesson.review_on,
        })),
      };
    },

    async setPreference(userId, key, value) {
      const result = await supabase.rpc('set_email_preference', {
        p_user: userId,
        p_key: key,
        p_value: value,
      });
      const { error } = result;
      const data: unknown = result.data;
      if (error) fail('set_email_preference', error);
      return z.boolean().parse(data);
    },
  };
}

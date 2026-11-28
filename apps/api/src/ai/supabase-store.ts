import {
  aiEffortSchema,
  aiModelIdSchema,
  aiProviderSchema,
  type AiKeySummary,
  type AiSettings,
} from '@trama/core';
import { check, createUserClient, iso } from '../supabase';
import type { AiStore, StoredAiKey } from './store';

interface KeyRow {
  provider: string;
  last4: string;
  updated_at: string;
}

interface SettingsRow {
  provider: string;
  model: string;
  effort: string;
}

function summaryOf(row: KeyRow): AiKeySummary | null {
  const provider = aiProviderSchema.safeParse(row.provider);
  if (!provider.success) return null;
  return { provider: provider.data, last4: row.last4, savedAt: iso(row.updated_at) };
}

function settingsOf(row: SettingsRow): AiSettings | null {
  const provider = aiProviderSchema.safeParse(row.provider);
  const model = aiModelIdSchema.safeParse(row.model);
  const effort = aiEffortSchema.safeParse(row.effort);
  if (!provider.success || !model.success || !effort.success) return null;
  return { provider: provider.data, model: model.data, effort: effort.data };
}

/**
 * As chaves e as preferências de IA no Supabase, com o token da pessoa: a RLS só deixa as
 * linhas dela. A chave que passa por aqui já está cifrada; o texto puro nunca chega ao banco.
 */
export function createSupabaseAiStore(url: string, publishableKey: string, token: string): AiStore {
  const supabase = createUserClient(url, publishableKey, token);

  return {
    async getSettings() {
      const { data, error, status } = await supabase
        .from('ai_settings')
        .select('provider, model, effort')
        .returns<SettingsRow[]>()
        .maybeSingle();
      check(error, status);
      return data ? settingsOf(data) : null;
    },

    async saveSettings(settings) {
      // owner_id vem de auth.uid() (padrão da coluna); no conflito, a linha da pessoa é atualizada.
      const { error, status } = await supabase
        .from('ai_settings')
        .upsert(
          { provider: settings.provider, model: settings.model, effort: settings.effort },
          { onConflict: 'owner_id' },
        );
      check(error, status);
      return settings;
    },

    async listKeys() {
      const { data, error, status } = await supabase
        .from('ai_keys')
        .select('provider, last4, updated_at')
        .order('provider')
        .returns<KeyRow[]>();
      check(error, status);
      return (data ?? []).flatMap((row) => summaryOf(row) ?? []);
    },

    async getKey(provider) {
      const { data, error, status } = await supabase
        .from('ai_keys')
        .select('provider, key_encrypted, last4')
        .eq('provider', provider)
        .returns<{ provider: string; key_encrypted: string; last4: string }[]>()
        .maybeSingle();
      check(error, status);
      if (!data) return null;
      const stored: StoredAiKey = {
        provider,
        keyEncrypted: data.key_encrypted,
        last4: data.last4,
      };
      return stored;
    },

    async saveKey(key) {
      const { data, error, status } = await supabase
        .from('ai_keys')
        .upsert(
          { provider: key.provider, key_encrypted: key.keyEncrypted, last4: key.last4 },
          { onConflict: 'owner_id,provider' },
        )
        .select('provider, last4, updated_at')
        .returns<KeyRow[]>()
        .single();
      check(error, status);
      const summary = data ? summaryOf(data) : null;
      if (!summary) throw new Error('Supabase: a chave não voltou depois de guardada.');
      return summary;
    },

    async deleteKey(provider) {
      const { error, status } = await supabase.from('ai_keys').delete().eq('provider', provider);
      check(error, status);
    },
  };
}

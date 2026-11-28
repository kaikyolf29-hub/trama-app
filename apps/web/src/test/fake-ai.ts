import {
  aiKeyLast4,
  type AiKeySummary,
  type AiModel,
  type AiProvider,
  type AiSettings,
} from '@trama/core';
import { vi } from 'vitest';
import type { AiApi } from '../api/ai-api';
import { ApiError } from '../api/http';

const model = (id: string, name: string): AiModel => ({
  id,
  name,
  maxInputTokens: 200_000,
  maxOutputTokens: 64_000,
});

/** API de IA em memória para os testes das telas. */
export function createFakeAi(
  initial: { settings?: AiSettings | null; keys?: AiKeySummary[] } = {},
) {
  const state = {
    settings: initial.settings ?? (null as AiSettings | null),
    keys: new Map<AiProvider, AiKeySummary>((initial.keys ?? []).map((key) => [key.provider, key])),
    /** Chaves coladas, na ordem em que chegaram (só a tela de teste vê). */
    sent: [] as { provider: AiProvider; apiKey: string }[],
    saved: [] as AiSettings[],
    deleted: [] as AiProvider[],
    /** Chaves que o "provedor" recusa. */
    rejected: new Set<string>(),
    models: {
      anthropic: [
        model('claude-opus-5-5', 'Claude Opus 5.5'),
        model('claude-sonnet-5-5', 'Claude Sonnet 5.5'),
        model('claude-haiku-5-5', 'Claude Haiku 5.5'),
      ],
      google: [model('gemini-3-pro', 'Gemini 3 Pro'), model('gemini-3-flash', 'Gemini 3 Flash')],
      openai: [model('gpt-5', 'gpt-5'), model('o4-mini', 'o4-mini')],
    } as Record<AiProvider, AiModel[]>,
    /** Mensagem da próxima chamada à API, gasta ao falhar. */
    failNext: null as { message: string; code?: ApiError['code'] } | null,
    /** Falha só na lista de modelos (gasta ao falhar). */
    failModels: null as { message: string; code?: ApiError['code'] } | null,
    now: '2026-11-28T12:00:00.000Z',
  };
  const fail = () => {
    const next = state.failNext;
    state.failNext = null;
    return next ? new ApiError(next.message, 422, next.code) : null;
  };
  const api: AiApi = {
    getSettings() {
      const error = fail();
      return error ? Promise.reject(error) : Promise.resolve(state.settings);
    },
    saveSettings(settings) {
      const error = fail();
      if (error) return Promise.reject(error);
      state.settings = settings;
      state.saved.push(settings);
      return Promise.resolve(settings);
    },
    listKeys: () => Promise.resolve([...state.keys.values()]),
    saveKey(provider, apiKey) {
      const error = fail();
      if (error) return Promise.reject(error);
      state.sent.push({ provider, apiKey });
      if (state.rejected.has(apiKey)) {
        return Promise.reject(
          new ApiError(
            'O provedor recusou a chave. Confira se ela está ativa.',
            422,
            'key_rejected',
          ),
        );
      }
      const summary: AiKeySummary = { provider, last4: aiKeyLast4(apiKey), savedAt: state.now };
      state.keys.set(provider, summary);
      return Promise.resolve(summary);
    },
    deleteKey(provider) {
      const error = fail();
      if (error) return Promise.reject(error);
      state.keys.delete(provider);
      state.deleted.push(provider);
      return Promise.resolve();
    },
    listModels(provider) {
      const next = state.failModels;
      state.failModels = null;
      const error = next ? new ApiError(next.message, 422, next.code) : fail();
      return error ? Promise.reject(error) : Promise.resolve(state.models[provider]);
    },
    estimate: vi.fn(() => Promise.reject(new Error('fora desta tela'))),
    organize: vi.fn(() => Promise.reject(new Error('fora desta tela'))),
  };
  return { api, state };
}

import type { AiKeySummary, AiProvider, AiSettings } from '@trama/core';
import type { AiStore, StoredAiKey } from './store';

/** As chaves e as preferências em memória, só para testes. */
export function createMemoryAiStore(clock: () => Date = () => new Date()): AiStore & {
  settings: AiSettings | null;
  keys: Map<AiProvider, StoredAiKey & { savedAt: string }>;
} {
  const store = {
    settings: null as AiSettings | null,
    keys: new Map<AiProvider, StoredAiKey & { savedAt: string }>(),
    getSettings: () => Promise.resolve(store.settings),
    saveSettings(settings: AiSettings) {
      store.settings = settings;
      return Promise.resolve(settings);
    },
    listKeys() {
      const summaries: AiKeySummary[] = [...store.keys.values()].map((key) => ({
        provider: key.provider,
        last4: key.last4,
        savedAt: key.savedAt,
      }));
      return Promise.resolve(summaries);
    },
    getKey(provider: AiProvider) {
      const key = store.keys.get(provider);
      return Promise.resolve(
        key ? { provider, keyEncrypted: key.keyEncrypted, last4: key.last4 } : null,
      );
    },
    saveKey(key: StoredAiKey) {
      const savedAt = clock().toISOString();
      store.keys.set(key.provider, { ...key, savedAt });
      return Promise.resolve({ provider: key.provider, last4: key.last4, savedAt });
    },
    deleteKey(provider: AiProvider) {
      store.keys.delete(provider);
      return Promise.resolve();
    },
  };
  return store;
}

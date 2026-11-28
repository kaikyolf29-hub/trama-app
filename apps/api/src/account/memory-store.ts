import { applyProfileUpdate, type Profile } from '@trama/core';
import type { AccountStore } from './store';

/** Perfil em memória, com a mesma regra de junção do banco. Só para testes. */
export function createMemoryAccountStore(initial: Profile | null): AccountStore & {
  profile: Profile | null;
} {
  const store = {
    profile: initial,
    getProfile: () => Promise.resolve(store.profile),
    updateProfile(patch: Parameters<AccountStore['updateProfile']>[0]) {
      if (store.profile) store.profile = applyProfileUpdate(store.profile, patch);
      return Promise.resolve(store.profile);
    },
  };
  return store;
}

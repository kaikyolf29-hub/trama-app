import {
  applyProfileUpdate,
  DEFAULT_EMAIL_PREFERENCES,
  DEFAULT_TIME_ZONE,
  type Profile,
  type UpdateProfileRequest,
} from '@trama/core';
import type { AccountApi } from '../api/account-api';
import { ApiError } from '../api/projects-api';
import { vi } from 'vitest';

/** API da conta em memória para os testes das telas. */
export function createFakeAccount(initial?: Partial<Profile>) {
  const state = {
    profile: {
      name: 'Ana Souza',
      timezone: DEFAULT_TIME_ZONE,
      emailPreferences: { ...DEFAULT_EMAIL_PREFERENCES },
      ...initial,
    },
    patches: [] as UpdateProfileRequest[],
    /** Mensagem da próxima falha (de leitura ou de gravação), gasta ao falhar. */
    failNext: null as string | null,
  };
  const fail = () => {
    const message = state.failNext;
    state.failNext = null;
    return message === null ? null : new ApiError(message, 0);
  };
  const api: AccountApi = {
    getProfile() {
      const error = fail();
      return error ? Promise.reject(error) : Promise.resolve(state.profile);
    },
    updateProfile(patch) {
      const error = fail();
      if (error) return Promise.reject(error);
      state.patches.push(patch);
      state.profile = applyProfileUpdate(state.profile, patch);
      return Promise.resolve(state.profile);
    },
    sendWelcome: vi.fn(() => Promise.resolve()),
  };
  return { api, state };
}

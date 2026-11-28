import {
  profileSchema,
  welcomeResponseSchema,
  type Profile,
  type UpdateProfileRequest,
} from '@trama/core';
import { createCaller } from './http';

/** O que as telas usam da API da conta (apps/api, `/account`). */
export interface AccountApi {
  getProfile(): Promise<Profile>;
  /** Muda só o que vier em `patch` e devolve o perfil já atualizado. */
  updateProfile(patch: UpdateProfileRequest): Promise<Profile>;
  /** Pede o e-mail de boas-vindas; a API só manda na primeira vez de cada pessoa. */
  sendWelcome(): Promise<void>;
}

/** Cliente da API da conta. Toda resposta passa pelo esquema do `@trama/core`. */
export function createAccountApi(config: {
  baseUrl: string;
  getToken: () => Promise<string | null>;
  fetch?: typeof fetch;
}): AccountApi {
  const call = createCaller(config);
  return {
    getProfile: () => call('/account/profile', profileSchema),
    updateProfile: (patch) =>
      call('/account/profile', profileSchema, { method: 'PATCH', body: JSON.stringify(patch) }),
    async sendWelcome() {
      await call('/account/welcome', welcomeResponseSchema, { method: 'POST' });
    },
  };
}

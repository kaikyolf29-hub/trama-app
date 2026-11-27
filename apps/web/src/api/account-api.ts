import {
  apiErrorSchema,
  profileSchema,
  type Profile,
  type UpdateProfileRequest,
} from '@trama/core';
import { ApiError } from './projects-api';

/** O que as telas usam da API da conta (apps/api, `/account`). */
export interface AccountApi {
  getProfile(): Promise<Profile>;
  /** Muda só o que vier em `patch` e devolve o perfil já atualizado. */
  updateProfile(patch: UpdateProfileRequest): Promise<Profile>;
}

const OFFLINE = 'Sem conexão com o Trama. Confira a internet e tente de novo.';
const SIGNED_OUT = 'Entre na sua conta para continuar.';
const GENERIC = 'Algo deu errado. Tente de novo em instantes.';

/** Cliente da API da conta. Toda resposta passa pelo esquema do `@trama/core`. */
export function createAccountApi({
  baseUrl,
  getToken,
  fetch: fetcher = (...args) => fetch(...args),
}: {
  baseUrl: string;
  getToken: () => Promise<string | null>;
  fetch?: typeof fetch;
}): AccountApi {
  const root = baseUrl.replace(/\/$/, '');

  async function call(init: RequestInit = {}): Promise<Profile> {
    const token = await getToken();
    if (!token) throw new ApiError(SIGNED_OUT, 401);
    let response: Response;
    try {
      response = await fetcher(`${root}/account/profile`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
      });
    } catch {
      throw new ApiError(OFFLINE, 0);
    }
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const error = apiErrorSchema.safeParse(body);
      throw new ApiError(error.success ? error.data.error : GENERIC, response.status);
    }
    const parsed = profileSchema.safeParse(body);
    if (!parsed.success)
      throw new ApiError('A resposta do Trama veio num formato inesperado.', 502);
    return parsed.data;
  }

  return {
    getProfile: () => call(),
    updateProfile: (patch) => call({ method: 'PATCH', body: JSON.stringify(patch) }),
  };
}

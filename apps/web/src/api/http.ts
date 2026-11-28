import { aiErrorBodySchema, type AiErrorCode } from '@trama/core';
import type { z } from 'zod';

/** Erro da API já em português, pronto para a tela. `status` 0 quer dizer sem conexão. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Motivo, quando a API diz (as rotas de IA dizem: chave recusada, sem chave...). */
    readonly code?: AiErrorCode,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const OFFLINE = 'Sem conexão com o Trama. Suas mudanças ficam aqui e salvam quando voltar.';
const SIGNED_OUT = 'Entre na sua conta para continuar.';

export type Caller = <T>(path: string, schema: z.ZodType<T>, init?: RequestInit) => Promise<T>;

/**
 * Chamada à API do Trama com o token de login. Toda resposta passa pelos esquemas do
 * `@trama/core`: se a API mandar algo fora do contrato, a tela não recebe dado quebrado.
 */
export function createCaller({
  baseUrl,
  getToken,
  fetch: fetcher = (...args) => fetch(...args),
}: {
  baseUrl: string;
  getToken: () => Promise<string | null>;
  fetch?: typeof fetch;
}): Caller {
  const root = baseUrl.replace(/\/$/, '');

  return async function call<T>(
    path: string,
    schema: z.ZodType<T>,
    init: RequestInit = {},
  ): Promise<T> {
    const token = await getToken();
    if (!token) throw new ApiError(SIGNED_OUT, 401);
    let response: Response;
    try {
      response = await fetcher(`${root}${path}`, {
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
      const error = aiErrorBodySchema.safeParse(body);
      throw new ApiError(
        error.success ? error.data.error : 'Algo deu errado. Tente de novo em instantes.',
        response.status,
        error.success ? error.data.code : undefined,
      );
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      throw new ApiError('A resposta do Trama veio num formato inesperado.', 502);
    return parsed.data;
  };
}

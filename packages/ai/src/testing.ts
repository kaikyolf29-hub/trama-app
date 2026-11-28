import type { AiModel, AiProvider as AiProviderId } from '@trama/core';
import { flowPrompt, promptPrompt } from '../prompts';
import { messages, type AiError } from './errors';
import type { AiProvider, Estimate, OrganizeParams, OrganizeResult } from './types';

/**
 * Peças para testar sem rede: um `fetch` falso (para os SDKs) e um provedor falso (para a API).
 * Importe de `@trama/ai/testing`; o Worker de verdade não usa este arquivo.
 */

/** O que o `fetch` falso viu: o endereço, o método, os cabeçalhos e o corpo já em JSON. */
export interface RecordedRequest {
  url: URL;
  method: string;
  headers: Headers;
  body: unknown;
}

/** Lê um campo do corpo de um pedido (JSON qualquer): `at(body, 'a', 'b', '0')`. */
export function at(value: unknown, ...path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export type FakeReply = { status?: number; json: unknown; headers?: Record<string, string> };

/** Um `fetch` que responde pelo `handler` e guarda cada pedido em `requests`. */
export function createFakeFetch(handler: (request: RecordedRequest) => FakeReply) {
  const requests: RecordedRequest[] = [];
  const fakeFetch: typeof fetch = (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    const rawBody = init?.body;
    const request: RecordedRequest = {
      url,
      method: (init?.method ?? 'GET').toUpperCase(),
      headers: new Headers(init?.headers),
      body: typeof rawBody === 'string' && rawBody ? (JSON.parse(rawBody) as unknown) : undefined,
    };
    requests.push(request);
    const reply = handler(request);
    return Promise.resolve(
      new Response(JSON.stringify(reply.json), {
        status: reply.status ?? 200,
        headers: { 'content-type': 'application/json', ...reply.headers },
      }),
    );
  };
  return { fetch: fakeFetch, requests };
}

/** Um provedor que devolve respostas fixas e anota o que recebeu. */
export function createFakeProvider(
  options: {
    id?: AiProviderId;
    models?: AiModel[];
    /** Troca a resposta de `organize`; lançar `AiError` simula uma falha do provedor. */
    organize?: (params: OrganizeParams) => OrganizeResult;
    /** Falha em tudo, como uma chave recusada. */
    fail?: AiError;
    estimate?: Estimate;
  } = {},
): AiProvider & {
  calls: { organize: OrganizeParams[]; estimate: OrganizeParams[]; list: number };
} {
  const id = options.id ?? 'anthropic';
  const calls = { organize: [] as OrganizeParams[], estimate: [] as OrganizeParams[], list: 0 };
  const usage = { inputTokens: 1200, outputTokens: 800 };
  return {
    id,
    calls,
    listModels() {
      calls.list += 1;
      if (options.fail) return Promise.reject(options.fail);
      return Promise.resolve(
        options.models ?? [
          { id: 'modelo-a', name: 'Modelo A', maxInputTokens: 200_000, maxOutputTokens: 64_000 },
          { id: 'modelo-b', name: 'Modelo B', maxInputTokens: null, maxOutputTokens: null },
        ],
      );
    },
    organize(params) {
      calls.organize.push(params);
      if (options.fail) return Promise.reject(options.fail);
      if (options.organize) {
        try {
          return Promise.resolve(options.organize(params));
        } catch (error) {
          return Promise.reject(error instanceof Error ? error : messages.other(id));
        }
      }
      return Promise.resolve(
        params.format === 'prompt'
          ? { format: 'prompt', output: promptPrompt.example.output, usage }
          : { format: params.format, output: flowPrompt.example.output, usage },
      );
    },
    estimate(params) {
      calls.estimate.push(params);
      if (options.fail) return Promise.reject(options.fail);
      return Promise.resolve(
        options.estimate ?? { inputTokens: 900, outputTokens: 1500, costUsd: 0.0123 },
      );
    },
  };
}

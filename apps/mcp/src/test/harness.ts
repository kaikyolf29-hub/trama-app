import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { Deps } from '../deps';
import type { Env } from '../env';
import { toBase64Url } from '../vault';
import { createWorker } from '../worker';
import { createFakeSupabase } from './fake-supabase';
import { createFakeTrama } from './fake-trama';
import { createMemoryKV } from './memory-kv';
import { jsonOf } from './json';

export const MCP = 'https://mcp.test';
export const SITE = 'https://trama.test';
export const REDIRECT = 'https://claude.test/callback';

const encoder = new TextEncoder();

async function s256(verifier: string): Promise<string> {
  return toBase64Url(
    new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))),
  );
}

/**
 * O Worker inteiro em memória: a biblioteca de OAuth de verdade, KV em memória, um Supabase Auth e
 * uma API do Trama falsos e um relógio que os testes avançam.
 */
export function createHarness(options: { encryptionKey?: string | null; expiresIn?: number } = {}) {
  let clock = new Date('2026-11-28T15:00:00.000Z').getTime();
  const now = () => new Date(clock);
  const kv = createMemoryKV(() => clock);
  const supabase = createFakeSupabase({ expiresIn: options.expiresIn ?? 3600 });
  const trama = createFakeTrama({ now });
  const apiTokens: string[] = [];
  const deps: Deps = {
    fetch: supabase.fetch,
    api: (_env, token) => {
      apiTokens.push(token);
      return trama.api(token);
    },
    now,
  };
  const worker = createWorker(deps);
  const env = {
    OAUTH_KV: kv,
    SUPABASE_URL: 'https://supabase.test',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_teste',
    APP_URL: SITE,
    MCP_URL: MCP,
    ...(options.encryptionKey === null
      ? {}
      : {
          MCP_ENCRYPTION_KEY:
            options.encryptionKey ?? btoa(String.fromCharCode(...new Uint8Array(32).fill(7))),
        }),
  } as unknown as Env;

  const pending: Promise<unknown>[] = [];
  const ctx = {
    waitUntil: (promise: Promise<unknown>) => void pending.push(promise),
    passThroughOnException() {},
    props: {},
  } as unknown as ExecutionContext;

  /** Um pedido ao Worker; espera o que ele deixou para depois (`waitUntil`). */
  async function send(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const request = new Request(input, init);
    const response = await worker.fetch(request, env, ctx);
    await Promise.all(pending.splice(0));
    return response;
  }

  /** Registra um cliente MCP (registro dinâmico, como o ChatGPT faz). */
  async function registerClient(name = 'Claude', scopeless = false) {
    void scopeless;
    const response = await send(`${MCP}/oauth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: name,
        redirect_uris: [REDIRECT],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      }),
    });
    if (response.status !== 201) throw new Error(`registro falhou: ${String(response.status)}`);
    return (await jsonOf<{ client_id: string }>(response)).client_id;
  }

  /** O que o `/authorize` devolve: o bilhete na volta para o site. */
  async function startAuthorization(
    clientId: string,
    scope: string | null = 'trama:read trama:write',
  ) {
    const verifier = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    const url = new URL(`${MCP}/authorize`);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: REDIRECT,
      state: 'estado-do-cliente',
      code_challenge: await s256(verifier),
      code_challenge_method: 'S256',
      resource: `${MCP}/mcp`,
      ...(scope === null ? {} : { scope }),
    }).toString();
    const response = await send(url, { redirect: 'manual' });
    const location = response.headers.get('Location') ?? '';
    return {
      response,
      location,
      verifier,
      ticket: new URL(location, SITE).hash.replace(/^#t=/, ''),
    };
  }

  const decide = (body: unknown, accessToken?: string) =>
    send(`${MCP}/connect/decision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
    });

  /** Do `/authorize` até os tokens do MCP, como o cliente e a pessoa fariam. */
  async function connect(
    input: { userId?: string; name?: string; requested?: string | null; allowed?: string[] } = {},
  ) {
    const userId = input.userId ?? 'ana';
    const clientId = await registerClient(input.name ?? 'Claude');
    const started = await startAuthorization(clientId, input.requested);
    // O site abre uma sessão nova só para o conector (com a senha) e a manda com a decisão.
    const session = supabase.signIn(userId);
    const decision = await decide(
      {
        decision: 'allow',
        ticket: started.ticket,
        scopes: input.allowed ?? ['trama:read', 'trama:write'],
        refreshToken: session.refreshToken,
      },
      session.accessToken,
    );
    if (decision.status !== 200) throw new Error(`decisão falhou: ${String(decision.status)}`);
    const { redirectTo } = await jsonOf<{ redirectTo: string }>(decision);
    const code = new URL(redirectTo).searchParams.get('code') ?? '';
    const tokens = await exchange(
      {
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT,
        code_verifier: started.verifier,
      },
      clientId,
    );
    return { userId, clientId, ...tokens, session };
  }

  async function exchange(params: Record<string, string>, clientId: string) {
    const response = await send(`${MCP}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, resource: `${MCP}/mcp`, ...params }),
    });
    const body = await jsonOf<{
      access_token?: string;
      refresh_token?: string;
      scope?: string;
      expires_in?: number;
      error?: string;
    }>(response);
    return {
      response,
      body,
      accessToken: body.access_token ?? '',
      refreshToken: body.refresh_token ?? '',
    };
  }

  /** Um cliente MCP de verdade (o do SDK), falando com o Worker com o token do MCP. */
  async function mcpClient(accessToken: string) {
    const transport = new StreamableHTTPClientTransport(new URL(`${MCP}/mcp`), {
      fetch: (input, init) => send(input, init),
      requestInit: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const client = new Client({ name: 'cliente-de-teste', version: '1.0.0' });
    await client.connect(transport);
    return client;
  }

  /** Um pedido JSON-RPC cru ao `/mcp` (para ver o status HTTP, que o SDK esconde). */
  const rawMcp = (accessToken: string | null, body: unknown) =>
    send(`${MCP}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
    });

  const site = (path: string, accessToken?: string, init: RequestInit = {}) =>
    send(`${MCP}${path}`, {
      ...init,
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...init.headers,
      },
    });

  return {
    send,
    site,
    env,
    kv,
    supabase,
    trama,
    apiTokens,
    registerClient,
    startAuthorization,
    decide,
    connect,
    exchange,
    mcpClient,
    rawMcp,
    advance(ms: number) {
      clock += ms;
    },
    now,
  };
}

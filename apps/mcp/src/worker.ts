import { OAuthProvider, type OAuthResourceAuth } from '@cloudflare/workers-oauth-provider';
import { MCP_SCOPE_READ, MCP_SCOPE_WRITE } from '@trama/core';
import { defaultDeps, type Deps } from './deps';
import { handleMcp } from './endpoint';
import type { AccessProps, Env } from './env';
import { exchangeSupabaseSession } from './exchange';
import { createSiteApp } from './site';

/** O caminho do servidor MCP: é o `resource` do OAuth e o endereço que se cola nos clientes. */
export const MCP_PATH = '/mcp';

/** Quanto a concessão dura sem ninguém usar: 30 dias. */
const REFRESH_IDLE_TTL_SECONDS = 30 * 24 * 60 * 60;

/** O endereço público deste Worker: `MCP_URL`, ou o do pedido (vale no `pnpm dev`). */
function baseUrl(env: Env, request: Request): string {
  return (env.MCP_URL ?? new URL(request.url).origin).replace(/\/+$/, '');
}

function buildProvider(base: string, deps: Deps) {
  const site = createSiteApp(deps);
  return new OAuthProvider<Env>({
    apiRoute: MCP_PATH,
    apiHandler: {
      fetch: (request, env, ctx) =>
        handleMcp(
          request,
          env,
          ctx as ExecutionContext & { props: AccessProps; auth: OAuthResourceAuth },
          deps,
        ),
    },
    defaultHandler: {
      fetch: (request, env, ctx) => site.fetch(request, env, ctx),
    },
    authorizeEndpoint: '/authorize',
    tokenEndpoint: '/oauth/token',
    // Clientes que não se identificam por documento na web (ChatGPT, por exemplo) se registram aqui.
    clientRegistrationEndpoint: '/oauth/register',
    clientIdMetadataDocumentEnabled: true,
    scopesSupported: [MCP_SCOPE_READ, MCP_SCOPE_WRITE],
    // Leitura é o mínimo para usar o servidor; a escrita vem por "step-up" (`insufficient_scope`).
    requiredScopes: [MCP_SCOPE_READ],
    resourceMetadata: {
      resource: `${base}${MCP_PATH}`,
      authorization_servers: [base],
      resource_name: 'Trama',
    },
    refreshTokenIdleTTL: REFRESH_IDLE_TTL_SECONDS,
    tokenExchangeCallback: (options) => exchangeSupabaseSession(options, deps),
    onError: (error) => {
      // Só o código e o motivo (estáveis, sem dados de ninguém).
      if (error.status >= 500) console.error('erro de OAuth', error.code, error.internal.reason);
    },
  });
}

/**
 * O Worker do conector: a biblioteca de OAuth na frente, o servidor MCP em `/mcp` e as rotas do
 * site (`/authorize`, `/connect/*`, `/connectors`) no resto. O OAuthProvider é criado na primeira
 * vez para cada endereço público (o `resource` e o `issuer` dependem dele).
 */
export function createWorker(deps: Deps = defaultDeps()) {
  const providers = new Map<string, OAuthProvider<Env>>();

  return {
    fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
      const base = baseUrl(env, request);
      let provider = providers.get(base);
      if (!provider) {
        provider = buildProvider(base, deps);
        providers.set(base, provider);
      }
      return provider.fetch(request, env, ctx);
    },
  };
}

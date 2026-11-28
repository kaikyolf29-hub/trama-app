import { insufficientScope, type OAuthResourceAuth } from '@cloudflare/workers-oauth-provider';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { hasMcpScopes, mcpToolNameSchema, mcpToolRequiredScopes, type McpScope } from '@trama/core';
import type { Deps } from './deps';
import type { AccessProps, Env } from './env';
import { createTramaServer } from './tools';
import { touchLastUsed } from './usage';

/**
 * As permissões que o pedido exige: a das ferramentas que ele chama (`tools/call`, sozinho ou em
 * lote). Só lê o corpo; quem responde é o SDK. `null` quando o pedido não chama ferramenta.
 */
export async function scopesNeededBy(request: Request): Promise<McpScope[] | null> {
  if (request.method !== 'POST') return null;
  let body: unknown;
  try {
    body = await request.clone().json();
  } catch {
    return null;
  }
  const needed = new Set<McpScope>();
  for (const message of Array.isArray(body) ? body : [body]) {
    if (typeof message !== 'object' || message === null) continue;
    const { method, params } = message as { method?: unknown; params?: { name?: unknown } };
    if (method !== 'tools/call') continue;
    const tool = mcpToolNameSchema.safeParse(params?.name);
    if (tool.success) for (const scope of mcpToolRequiredScopes(tool.data)) needed.add(scope);
  }
  return needed.size > 0 ? [...needed] : null;
}

type ApiContext = ExecutionContext & { props: AccessProps; auth: OAuthResourceAuth };

/**
 * O endereço `/mcp`: já chega aqui com um token válido (a biblioteca conferiu). Chamar uma
 * ferramenta de escrita sem a permissão de escrita é recusado antes de o SDK ver o pedido, com o
 * desafio `insufficient_scope` (403) que o cliente usa para pedir a permissão de novo.
 */
export async function handleMcp(
  request: Request,
  env: Env,
  ctx: ApiContext,
  deps: Deps,
): Promise<Response> {
  const needed = await scopesNeededBy(request);
  if (needed && !hasMcpScopes(ctx.auth.scope, needed)) {
    return insufficientScope(
      ctx.auth,
      needed,
      'Esta conexão só tem permissão de leitura. Permita a escrita para criar e mudar projetos.',
    );
  }

  const { userId, grantId, clientName, supabaseAccessToken } = ctx.props;
  ctx.waitUntil(
    touchLastUsed(env, userId, grantId, deps.now()).catch(() => {
      // Não poder anotar o último uso nunca derruba a chamada.
    }),
  );

  const handler = createMcpHandler(
    () =>
      createTramaServer({
        api: deps.api(env, supabaseAccessToken),
        scopes: ctx.auth.scope,
        clientName,
        appUrl: env.APP_URL,
        now: () => deps.now(),
      }),
    {
      onerror: (error) => {
        console.error('erro no servidor MCP', error.name);
      },
    },
  );
  return handler.fetch(request, {
    // O token do MCP não vai para o SDK: nenhuma ferramenta precisa dele.
    authInfo: {
      token: '',
      clientId: ctx.auth.clientId ?? '',
      scopes: ctx.auth.scope,
      ...(ctx.auth.expiresAt === undefined ? {} : { expiresAt: ctx.auth.expiresAt }),
    },
  });
}

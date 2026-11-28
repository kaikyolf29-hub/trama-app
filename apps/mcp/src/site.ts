import {
  AuthorizationError,
  CimdFetchError,
  authorizationErrorRedirect,
} from '@cloudflare/workers-oauth-provider';
import {
  MCP_SCOPE_READ,
  approvedMcpScopes,
  cleanClientName,
  mcpConnectorListSchema,
  mcpConsentDecisionSchema,
  mcpConsentInfoSchema,
  mcpConsentResultSchema,
  mcpScopeSchema,
  parseMcpScopes,
  type McpScope,
} from '@trama/core';
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import type { Deps } from './deps';
import type { Env, GrantProps } from './env';
import { appBase, isAllowedOrigin } from './origin';
import { SessionEndedError, SupabaseUnavailableError, getUserId, refreshSession } from './supabase';
import { openTicket, sealTicket } from './ticket';
import { lastUsedKey } from './usage';
import { refreshTokenAad, vaultFor, type Vault } from './vault';

type SiteEnv = { Bindings: Env; Variables: { deps: Deps } };
type Ctx = Context<SiteEnv>;

const SESSION_ENDED = { error: 'Sua sessão acabou. Entre de novo para continuar.' };
const TICKET_EXPIRED = {
  error: 'Este pedido venceu. Volte ao aplicativo e conecte de novo.',
};
const NOT_CONFIGURED = {
  error: 'O conector ainda não está configurado neste ambiente.',
};

/** Escapa o texto que vem do cliente antes de pôr numa página (o nome do cliente é de quem o registrou). */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${String(char.charCodeAt(0))};`);
}

/** Uma página simples de erro, para o que acontece antes de a pessoa chegar ao site. */
function errorPage(status: 400 | 503, message: string): Response {
  const body = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Trama</title></head><body style="font-family: system-ui, sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1rem"><h1>Não deu para conectar</h1><p>${escapeHtml(message)}</p></body></html>`;
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "frame-ancestors 'none'",
      'X-Frame-Options': 'DENY',
    },
  });
}

const bearerOf = (c: Ctx) => /^Bearer (\S+)$/.exec(c.req.header('Authorization') ?? '')?.[1];

async function readJson(c: Ctx): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

/** Quem é a pessoa do token do site; responde ao pedido sozinho quando não dá. */
async function authenticate(c: Ctx): Promise<{ userId: string } | Response> {
  const token = bearerOf(c);
  if (!token) return c.json(SESSION_ENDED, 401);
  try {
    return { userId: await getUserId(c.env, token, c.var.deps.fetch) };
  } catch (error) {
    if (error instanceof SessionEndedError) return c.json(SESSION_ENDED, 401);
    if (error instanceof SupabaseUnavailableError) {
      return c.json({ error: 'O login do Trama não respondeu. Tente de novo em instantes.' }, 503);
    }
    throw error;
  }
}

/** O que a pessoa pode conceder: o que o cliente pediu, menos o que ela tirou; leitura sempre. */
export function grantedScopes(
  requested: readonly McpScope[],
  chosen: readonly McpScope[],
): McpScope[] {
  const allowed = approvedMcpScopes(chosen);
  return allowed.filter((scope) => scope === MCP_SCOPE_READ || requested.includes(scope));
}

/**
 * As rotas que não são do protocolo OAuth: o `/authorize` (leva a pessoa à tela do site), as duas
 * rotas dessa tela (informações e decisão) e a lista de conectores de Configurações. O protocolo
 * (descoberta, registro, `/oauth/token`) a biblioteca responde sozinha.
 */
export function createSiteApp(deps: Deps) {
  const app = new Hono<SiteEnv>();

  app.use('*', (c, next) => {
    c.set('deps', deps);
    return next();
  });

  app.use(
    '*',
    cors({
      origin: (origin, c) => (isAllowedOrigin(origin, (c.env ?? {}) as Env) ? origin : null),
      allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type'],
      maxAge: 600,
    }),
  );

  app.get('/', (c) => c.json({ ok: true, service: 'trama-mcp' }));
  app.get('/health', (c) => c.json({ ok: true, service: 'trama-mcp' }));

  /**
   * O cliente MCP manda a pessoa para cá. A biblioteca confere o pedido (cliente, endereço de
   * retorno, PKCE); depois a pessoa vai para a tela de consentimento do site com um bilhete
   * assinado que leva o pedido. Nada é concedido aqui.
   */
  app.get('/authorize', async (c) => {
    const vault = await vaultFor(c.env.MCP_ENCRYPTION_KEY);
    if (!vault) return errorPage(503, NOT_CONFIGURED.error);
    const oauth = c.env.OAUTH_PROVIDER;
    try {
      const request = await oauth.parseAuthRequest(c.req.raw);
      const details = await oauth.describeConsent(request);
      const ticket = await sealTicket(
        vault,
        {
          request,
          clientName: cleanClientName(details.clientName),
          clientDomain: details.clientDomain ?? null,
          redirectHost: details.redirectHost,
          redirectIsLoopback: details.redirectIsLoopback,
          scopes: parseMcpScopes(request.scope),
        },
        c.var.deps.now(),
      );
      // O bilhete vai depois do `#`: não passa por log de servidor nem por Referer.
      return c.redirect(`${appBase(c.env)}/conectar#t=${ticket}`, 302);
    } catch (error) {
      if (error instanceof AuthorizationError && error.redirectTo) {
        return c.redirect(error.redirectTo, 302);
      }
      if (error instanceof AuthorizationError) return errorPage(400, error.description);
      if (error instanceof CimdFetchError) {
        return errorPage(400, 'Não deu para verificar o aplicativo que pediu acesso.');
      }
      throw error;
    }
  });

  /** O que a tela de consentimento mostra. O bilhete é a prova de que o pedido passou pela biblioteca. */
  app.get('/connect/info', async (c) => {
    const vault = await vaultFor(c.env.MCP_ENCRYPTION_KEY);
    if (!vault) return c.json(NOT_CONFIGURED, 503);
    const ticket = await openTicket(vault, c.req.query('ticket') ?? '', c.var.deps.now());
    if (!ticket) return c.json(TICKET_EXPIRED, 410);
    return c.json(
      mcpConsentInfoSchema.parse({
        clientName: ticket.clientName,
        clientDomain: ticket.clientDomain,
        redirectHost: ticket.redirectHost,
        redirectIsLoopback: ticket.redirectIsLoopback,
        scopes: ticket.scopes,
        expiresAt: new Date(ticket.exp).toISOString(),
      }),
    );
  });

  /** A decisão da pessoa. Permitir exige uma sessão nova do Supabase, aberta na tela só para o conector. */
  app.post('/connect/decision', async (c) => {
    const vault = await vaultFor(c.env.MCP_ENCRYPTION_KEY);
    if (!vault) return c.json(NOT_CONFIGURED, 503);
    const decision = mcpConsentDecisionSchema.safeParse(await readJson(c));
    if (!decision.success) return c.json({ error: 'Pedido inválido.' }, 400);
    const ticket = await openTicket(vault, decision.data.ticket, c.var.deps.now());
    if (!ticket) return c.json(TICKET_EXPIRED, 410);

    if (decision.data.decision === 'deny') {
      const redirectTo = authorizationErrorRedirect(
        ticket.request,
        'access_denied',
        'A pessoa não permitiu o acesso.',
      );
      return c.json(mcpConsentResultSchema.parse({ redirectTo }));
    }

    const who = await authenticate(c);
    if (who instanceof Response) return who;
    return allow(c, vault, ticket, who.userId, decision.data.scopes, decision.data.refreshToken);
  });

  /** Configurações → Conectores: os clientes que a pessoa autorizou. */
  app.get('/connectors', async (c) => {
    const who = await authenticate(c);
    if (who instanceof Response) return who;
    const oauth = c.env.OAUTH_PROVIDER;
    const connectors = [];
    let cursor: string | undefined;
    do {
      const page = await oauth.listUserGrants(who.userId, {
        limit: 100,
        ...(cursor ? { cursor } : {}),
      });
      for (const grant of page.items) {
        const meta = (grant.metadata ?? {}) as { clientName?: unknown; clientDomain?: unknown };
        const used = await c.env.OAUTH_KV.get(lastUsedKey(who.userId, grant.id));
        connectors.push({
          id: grant.id,
          clientName: cleanClientName(
            typeof meta.clientName === 'string' ? meta.clientName : undefined,
          ),
          clientDomain: typeof meta.clientDomain === 'string' ? meta.clientDomain : null,
          scopes: grant.scope.filter(
            (scope): scope is McpScope => mcpScopeSchema.safeParse(scope).success,
          ),
          createdAt: new Date(grant.createdAt * 1000).toISOString(),
          lastUsedAt: used,
        });
      }
      cursor = page.cursor;
    } while (cursor);
    connectors.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return c.json(
      mcpConnectorListSchema.parse({
        connectors: connectors.filter((item) => item.scopes.length > 0),
      }),
    );
  });

  /** Revogar: a concessão e todos os tokens dela deixam de valer na hora. */
  app.delete('/connectors/:id', async (c) => {
    const who = await authenticate(c);
    if (who instanceof Response) return who;
    const id = c.req.param('id');
    await c.env.OAUTH_PROVIDER.revokeGrant(id, who.userId);
    await c.env.OAUTH_KV.delete(lastUsedKey(who.userId, id));
    return c.body(null, 204);
  });

  app.notFound((c) => c.json({ error: 'Rota não encontrada.' }, 404));

  app.onError((error, c) => {
    // O que sai no log é só o nome do erro: a mensagem pode ter endereços e dados da pessoa.
    console.error('erro no conector', error instanceof Error ? error.name : typeof error);
    return c.json({ error: 'Algo deu errado. Tente de novo em instantes.' }, 500);
  });

  return app;
}

async function allow(
  c: Ctx,
  vault: Vault,
  ticket: NonNullable<Awaited<ReturnType<typeof openTicket>>>,
  userId: string,
  chosen: McpScope[],
  refreshToken: string,
): Promise<Response> {
  let session;
  try {
    session = await refreshSession(c.env, refreshToken, c.var.deps.fetch);
  } catch (error) {
    if (error instanceof SessionEndedError) {
      return c.json({ error: 'Não deu para abrir a sessão do conector. Tente de novo.' }, 401);
    }
    return c.json({ error: 'O login do Trama não respondeu. Tente de novo em instantes.' }, 503);
  }
  // A sessão do conector tem de ser da mesma pessoa que decidiu.
  try {
    if ((await getUserId(c.env, session.accessToken, c.var.deps.fetch)) !== userId) {
      return c.json({ error: 'Não deu para abrir a sessão do conector. Tente de novo.' }, 401);
    }
  } catch {
    return c.json({ error: 'O login do Trama não respondeu. Tente de novo em instantes.' }, 503);
  }

  const scope = grantedScopes(ticket.scopes, chosen);
  const props: GrantProps = {
    userId,
    clientName: ticket.clientName,
    // Só o refresh token novo fica guardado, cifrado e preso a esta pessoa.
    sealedRefreshToken: await vault.encrypt(session.refreshToken, refreshTokenAad(userId)),
  };
  try {
    const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
      request: ticket.request,
      userId,
      metadata: { clientName: ticket.clientName, clientDomain: ticket.clientDomain },
      scope,
      props,
    });
    return c.json(mcpConsentResultSchema.parse({ redirectTo }));
  } catch (error) {
    if (error instanceof AuthorizationError || error instanceof CimdFetchError) {
      return c.json({ error: 'O pedido do aplicativo não vale mais. Conecte de novo.' }, 400);
    }
    throw error;
  }
}

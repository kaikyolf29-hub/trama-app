import { mcpConsentDecisionSchema, type McpConnector, type McpConsentInfo } from '@trama/core';
import type { Page, Route } from '@playwright/test';

/** Endereço do conector que o site usa no `vite build` (VITE_MCP_URL do apps/web/.env). */
export const MCP_URL = 'http://localhost:8788';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
};

export const consentInfo: McpConsentInfo = {
  clientName: 'Claude',
  clientDomain: null,
  redirectHost: 'claude.test',
  redirectIsLoopback: false,
  scopes: ['trama:read', 'trama:write'],
  expiresAt: '2030-01-01T00:00:00.000Z',
};

/** Onde o conector devolve a pessoa depois de permitir, e depois de recusar. */
export const CLIENT_CALLBACK = 'https://claude.test/callback';

export interface McpCall {
  method: string;
  path: string;
  body: unknown;
  authorization: string | undefined;
}

/**
 * O Worker do conector (apps/mcp) em memória, só com as rotas que o site usa: informações do
 * consentimento, decisão e a lista de Configurações → Conectores.
 */
export class FakeMcp {
  consent: McpConsentInfo = consentInfo;
  connectors: McpConnector[] = [];
  readonly calls: McpCall[] = [];

  async attach(page: Page) {
    await page.route(`${MCP_URL}/**`, (route) => this.handle(route));
    // O cliente MCP (claude.test) é outro site: o teste só confere para onde o navegador foi.
    await page.route(`${CLIENT_CALLBACK}**`, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Voltou ao cliente</h1>' }),
    );
  }

  private json(route: Route, status: number, body?: unknown) {
    return route.fulfill({
      status,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  private async handle(route: Route) {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(request.url());
    const body: unknown = request.postData() ? request.postDataJSON() : undefined;
    this.calls.push({
      method: request.method(),
      path: url.pathname + url.search,
      body,
      authorization: request.headers().authorization,
    });

    if (url.pathname === '/connect/info') {
      return url.searchParams.get('ticket') === 'bilhete-e2e'
        ? this.json(route, 200, this.consent)
        : this.json(route, 410, {
            error: 'Este pedido venceu. Volte ao aplicativo e conecte de novo.',
          });
    }
    if (url.pathname === '/connect/decision') {
      const decision = mcpConsentDecisionSchema.parse(body);
      if (decision.decision === 'deny') {
        return this.json(route, 200, {
          redirectTo: `${CLIENT_CALLBACK}?error=access_denied&state=estado`,
        });
      }
      return this.json(route, 200, { redirectTo: `${CLIENT_CALLBACK}?code=codigo&state=estado` });
    }
    if (url.pathname === '/connectors' && request.method() === 'GET') {
      return this.json(route, 200, { connectors: this.connectors });
    }
    const revoke = /^\/connectors\/([^/]+)$/.exec(url.pathname);
    if (revoke && request.method() === 'DELETE') {
      this.connectors = this.connectors.filter(
        (item) => item.id !== decodeURIComponent(revoke[1] ?? ''),
      );
      return route.fulfill({ status: 204, headers: CORS });
    }
    return this.json(route, 404, { error: 'Rota não encontrada.' });
  }
}

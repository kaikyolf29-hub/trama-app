import type { McpConnector, McpConsentInfo } from '@trama/core';
import { vi } from 'vitest';
import type { ConnectorsApi } from '../api/connectors-api';
import { ApiError } from '../api/http';

export const DEFAULT_CONSENT: McpConsentInfo = {
  clientName: 'Claude',
  clientDomain: null,
  redirectHost: 'claude.ai',
  redirectIsLoopback: false,
  scopes: ['trama:read', 'trama:write'],
  expiresAt: '2026-11-28T15:10:00.000Z',
};

export const CONNECTOR: McpConnector = {
  id: 'g1',
  clientName: 'Claude',
  clientDomain: null,
  scopes: ['trama:read', 'trama:write'],
  createdAt: '2026-11-20T12:00:00.000Z',
  lastUsedAt: '2026-11-28T12:00:00.000Z',
};

/** A API do conector em memória, para as telas de consentimento e de Conectores. */
export function createFakeConnectors(
  options: { consent?: McpConsentInfo | Error; connectors?: McpConnector[] } = {},
) {
  const state = {
    connectors: [...(options.connectors ?? [])],
    allowed: [] as {
      ticket: string;
      scopes: string[];
      refreshToken: string;
      accessToken: string;
    }[],
    denied: [] as string[],
    revoked: [] as string[],
    infoCalls: [] as string[],
  };
  const api: ConnectorsApi = {
    endpoint: 'https://mcp.exemplo/mcp',
    consentInfo: vi.fn((ticket: string) => {
      state.infoCalls.push(ticket);
      const consent = options.consent ?? DEFAULT_CONSENT;
      return consent instanceof Error ? Promise.reject(consent) : Promise.resolve(consent);
    }),
    deny: vi.fn((ticket: string) => {
      state.denied.push(ticket);
      return Promise.resolve('https://claude.ai/callback?error=access_denied&state=x');
    }),
    allow: vi.fn(({ ticket, scopes, session }: Parameters<ConnectorsApi['allow']>[0]) => {
      state.allowed.push({
        ticket,
        scopes,
        refreshToken: session.refreshToken,
        accessToken: session.accessToken,
      });
      return Promise.resolve('https://claude.ai/callback?code=abc&state=x');
    }),
    list: vi.fn(() => Promise.resolve([...state.connectors])),
    revoke: vi.fn((id: string) => {
      state.revoked.push(id);
      state.connectors = state.connectors.filter((item) => item.id !== id);
      return Promise.resolve();
    }),
  };
  return { api, state };
}

export const expiredTicket = () =>
  new ApiError('Este pedido venceu. Volte ao aplicativo e conecte de novo.', 410);

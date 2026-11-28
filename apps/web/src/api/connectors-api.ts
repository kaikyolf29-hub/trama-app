import {
  mcpConnectorListSchema,
  mcpConsentInfoSchema,
  mcpConsentResultSchema,
  type McpConnector,
  type McpConsentInfo,
  type McpScope,
} from '@trama/core';
import { z } from 'zod';
import { createCaller } from './http';

/**
 * O que as telas usam do Worker do conector MCP (`apps/mcp`): a tela de consentimento e a lista
 * de Configurações → Conectores. Vai para o endereço do MCP (`VITE_MCP_URL`), não para a API.
 */
export interface ConnectorsApi {
  /** O endereço que se cola no Claude, no ChatGPT e no Codex (`.../mcp`). */
  endpoint: string;
  /** O que a tela de consentimento mostra; o bilhete vem do endereço (depois do `#`). */
  consentInfo(ticket: string): Promise<McpConsentInfo>;
  /** Recusa: devolve para onde mandar o navegador (de volta ao cliente, com `access_denied`). */
  deny(ticket: string): Promise<string>;
  /**
   * Permite. `session` é a sessão nova do Supabase aberta só para o conector: o token de acesso
   * vai no cabeçalho e o refresh token no corpo.
   */
  allow(input: {
    ticket: string;
    scopes: McpScope[];
    session: { accessToken: string; refreshToken: string };
  }): Promise<string>;
  list(): Promise<McpConnector[]>;
  /** Revoga: o cliente perde o acesso na hora. */
  revoke(id: string): Promise<void>;
}

interface Config {
  baseUrl: string;
  getToken: () => Promise<string | null>;
  fetch?: typeof fetch;
}

export function createConnectorsApi(config: Config): ConnectorsApi {
  const call = createCaller(config);
  const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });
  return {
    endpoint: `${config.baseUrl.replace(/\/$/, '')}/mcp`,
    consentInfo: (ticket) =>
      call(`/connect/info?ticket=${encodeURIComponent(ticket)}`, mcpConsentInfoSchema),
    async deny(ticket) {
      const result = await call(
        '/connect/decision',
        mcpConsentResultSchema,
        post({ decision: 'deny', ticket }),
      );
      return result.redirectTo;
    },
    async allow({ ticket, scopes, session }) {
      // A decisão é autenticada com a sessão do conector, não com a do site.
      const withSession = createCaller({
        ...config,
        getToken: () => Promise.resolve(session.accessToken),
      });
      const result = await withSession(
        '/connect/decision',
        mcpConsentResultSchema,
        post({ decision: 'allow', ticket, scopes, refreshToken: session.refreshToken }),
      );
      return result.redirectTo;
    },
    async list() {
      return (await call('/connectors', mcpConnectorListSchema)).connectors;
    },
    revoke: (id) =>
      call(`/connectors/${encodeURIComponent(id)}`, z.undefined(), { method: 'DELETE' }),
  };
}

import { describe, expect, it } from 'vitest';
import { eventDetailSchema, eventTitleSchema } from './agenda';
import {
  MCP_SCOPE_READ,
  MCP_SCOPE_WRITE,
  approvedMcpScopes,
  cleanClientName,
  hasMcpScopes,
  mcpAuditNote,
  mcpConnectorListSchema,
  mcpConsentDecisionSchema,
  mcpConsentInfoSchema,
  mcpToolNames,
  mcpToolRequiredScopes,
  mcpToolScopes,
  parseMcpScopes,
} from './mcp';

describe('parseMcpScopes', () => {
  it('leitura sempre entra, mesmo quando só a escrita foi pedida', () => {
    expect(parseMcpScopes([MCP_SCOPE_WRITE])).toEqual([MCP_SCOPE_READ, MCP_SCOPE_WRITE]);
  });

  it('pedido só de leitura continua só de leitura', () => {
    expect(parseMcpScopes([MCP_SCOPE_READ])).toEqual([MCP_SCOPE_READ]);
  });

  it('sem nenhum pedido (ou só nomes que não são nossos), oferece leitura e escrita', () => {
    expect(parseMcpScopes([])).toEqual([MCP_SCOPE_READ, MCP_SCOPE_WRITE]);
    expect(parseMcpScopes(['offline_access', 'openid'])).toEqual([MCP_SCOPE_READ, MCP_SCOPE_WRITE]);
  });

  it('ignora nomes desconhecidos quando há pedido válido', () => {
    expect(parseMcpScopes(['offline_access', MCP_SCOPE_READ])).toEqual([MCP_SCOPE_READ]);
  });
});

describe('permissões', () => {
  it('a pessoa pode tirar a escrita, nunca a leitura', () => {
    expect(approvedMcpScopes([MCP_SCOPE_READ])).toEqual([MCP_SCOPE_READ]);
    expect(approvedMcpScopes([MCP_SCOPE_WRITE])).toEqual([MCP_SCOPE_READ, MCP_SCOPE_WRITE]);
  });

  it('hasMcpScopes exige todas as permissões', () => {
    expect(hasMcpScopes([MCP_SCOPE_READ], ['trama:read'])).toBe(true);
    expect(hasMcpScopes([MCP_SCOPE_READ], ['trama:read', 'trama:write'])).toBe(false);
    expect(hasMcpScopes([MCP_SCOPE_WRITE], ['trama:read'])).toBe(false);
  });

  it('as nove ferramentas do plano têm permissão, como no plano', () => {
    expect(mcpToolNames).toHaveLength(9);
    const reads = mcpToolNames.filter((name) => mcpToolScopes[name] === MCP_SCOPE_READ);
    expect([...reads].sort()).toEqual(['buscar_agenda', 'ler_fluxo', 'listar_projetos']);
    expect(mcpToolRequiredScopes('criar_fluxo')).toEqual([MCP_SCOPE_READ, MCP_SCOPE_WRITE]);
    expect(mcpToolRequiredScopes('ler_fluxo')).toEqual([MCP_SCOPE_READ]);
  });

  it('não existe ferramenta que apaga', () => {
    expect(mcpToolNames.some((name) => /apag|delet|remov|exclu/.test(name))).toBe(false);
  });
});

describe('consentimento e conectores', () => {
  it('a decisão de permitir exige o refresh token e ao menos uma permissão', () => {
    const base = {
      ticket: 'abc.def',
      decision: 'allow',
      scopes: ['trama:read'],
      refreshToken: 'r',
    };
    expect(mcpConsentDecisionSchema.safeParse(base).success).toBe(true);
    expect(mcpConsentDecisionSchema.safeParse({ ...base, refreshToken: undefined }).success).toBe(
      false,
    );
    expect(mcpConsentDecisionSchema.safeParse({ ...base, scopes: [] }).success).toBe(false);
    expect(mcpConsentDecisionSchema.safeParse({ ...base, scopes: ['admin'] }).success).toBe(false);
  });

  it('recusar só leva o bilhete', () => {
    expect(mcpConsentDecisionSchema.safeParse({ ticket: 't', decision: 'deny' }).success).toBe(
      true,
    );
  });

  it('as informações da tela', () => {
    const info = mcpConsentInfoSchema.parse({
      clientName: 'Claude',
      clientDomain: null,
      redirectHost: 'claude.ai',
      redirectIsLoopback: false,
      scopes: ['trama:read'],
      expiresAt: '2026-11-28T12:00:00.000Z',
    });
    expect(info.redirectHost).toBe('claude.ai');
  });

  it('a lista de conectores aceita último uso vazio', () => {
    const list = mcpConnectorListSchema.parse({
      connectors: [
        {
          id: 'g1',
          clientName: 'Codex',
          clientDomain: null,
          scopes: ['trama:read'],
          createdAt: '2026-11-28T12:00:00.000Z',
          lastUsedAt: null,
        },
      ],
    });
    expect(list.connectors[0]?.lastUsedAt).toBeNull();
  });
});

describe('nome do cliente e anotação da Agenda', () => {
  it('limpa espaços e dá um nome a quem veio sem', () => {
    expect(cleanClientName('  Claude   Desktop ')).toBe('Claude Desktop');
    expect(cleanClientName('')).toBe('Cliente MCP');
    expect(cleanClientName(undefined)).toBe('Cliente MCP');
    expect(cleanClientName('x'.repeat(200)).length).toBeLessThanOrEqual(80);
  });

  it('a anotação diz o que foi feito e quem fez', () => {
    expect(
      mcpAuditNote({ clientName: 'Claude', action: 'flow_created', subject: 'Plano do vídeo' }),
    ).toEqual({ title: 'Fluxo criado: Plano do vídeo', detail: 'Pelo conector Claude' });
  });

  it('o texto sempre cabe nos limites da Agenda, mesmo com nomes enormes', () => {
    const note = mcpAuditNote({
      clientName: 'N'.repeat(900),
      action: 'blocks_added',
      subject: 'a '.repeat(500),
    });
    expect(eventTitleSchema.safeParse(note.title).success).toBe(true);
    expect(eventDetailSchema.safeParse(note.detail).success).toBe(true);
  });

  it('sem assunto, só o verbo', () => {
    expect(mcpAuditNote({ clientName: 'Claude', action: 'study_logged', subject: ' ' }).title).toBe(
      'Estudo registrado',
    );
  });
});

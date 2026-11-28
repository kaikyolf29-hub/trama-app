import { describe, expect, it, vi } from 'vitest';
import { createConnectorsApi } from './connectors-api';

function api(response: Response) {
  const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(response));
  return {
    fetcher,
    client: createConnectorsApi({
      baseUrl: 'https://mcp.exemplo/',
      getToken: () => Promise.resolve('token-do-site'),
      fetch: fetcher,
    }),
  };
}

const bodyOf = (init: RequestInit | undefined): unknown =>
  typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;

const headerOf = (init: RequestInit | undefined, name: string) =>
  new Headers(init?.headers).get(name);

describe('API do conector no site', () => {
  it('o endereço para colar nos clientes termina em /mcp', () => {
    expect(api(Response.json({})).client.endpoint).toBe('https://mcp.exemplo/mcp');
  });

  it('lê as informações do consentimento pelo bilhete', async () => {
    const info = {
      clientName: 'Claude',
      clientDomain: null,
      redirectHost: 'claude.ai',
      redirectIsLoopback: false,
      scopes: ['trama:read'],
      expiresAt: '2026-11-28T15:10:00.000Z',
    };
    const { client, fetcher } = api(Response.json(info));
    expect(await client.consentInfo('a.b+c')).toEqual(info);
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://mcp.exemplo/connect/info?ticket=a.b%2Bc');
  });

  it('permitir usa o token da sessão do conector, e não o do site, e manda o refresh no corpo', async () => {
    const { client, fetcher } = api(Response.json({ redirectTo: 'https://claude.ai/cb?code=1' }));
    const url = await client.allow({
      ticket: 't',
      scopes: ['trama:read'],
      session: { accessToken: 'acesso-conector', refreshToken: 'refresh-conector' },
    });
    expect(url).toBe('https://claude.ai/cb?code=1');
    const [, init] = fetcher.mock.calls[0] ?? [];
    expect(headerOf(init, 'Authorization')).toBe('Bearer acesso-conector');
    expect(bodyOf(init)).toEqual({
      decision: 'allow',
      ticket: 't',
      scopes: ['trama:read'],
      refreshToken: 'refresh-conector',
    });
  });

  it('recusar usa o token do site e não manda sessão nenhuma', async () => {
    const { client, fetcher } = api(Response.json({ redirectTo: 'https://claude.ai/cb?error=x' }));
    await client.deny('t');
    const [, init] = fetcher.mock.calls[0] ?? [];
    expect(headerOf(init, 'Authorization')).toBe('Bearer token-do-site');
    expect(bodyOf(init)).toEqual({ decision: 'deny', ticket: 't' });
  });

  it('lista os conectores e revoga com DELETE', async () => {
    const connector = {
      id: 'g1',
      clientName: 'Claude',
      clientDomain: null,
      scopes: ['trama:read'],
      createdAt: '2026-11-20T12:00:00.000Z',
      lastUsedAt: null,
    };
    expect(await api(Response.json({ connectors: [connector] })).client.list()).toEqual([
      connector,
    ]);
    const del = api(new Response(null, { status: 204 }));
    await expect(del.client.revoke('g 1')).resolves.toBeUndefined();
    expect(del.fetcher.mock.calls[0]?.[0]).toBe('https://mcp.exemplo/connectors/g%201');
    expect(del.fetcher.mock.calls[0]?.[1]?.method).toBe('DELETE');
  });

  it('o erro do conector chega como frase em português', async () => {
    const { client } = api(
      Response.json(
        { error: 'Este pedido venceu. Volte ao aplicativo e conecte de novo.' },
        { status: 410 },
      ),
    );
    await expect(client.consentInfo('t')).rejects.toMatchObject({
      status: 410,
      message: 'Este pedido venceu. Volte ao aplicativo e conecte de novo.',
    });
  });
});

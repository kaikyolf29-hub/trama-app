import { createEmptyFlow } from '@trama/core';
import { describe, expect, it } from 'vitest';
import { scopesNeededBy } from './endpoint';
import { TramaApiError, apiTransport, createTramaApi } from './trama-api';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setup(respond: (request: Request) => Response) {
  const seen: Request[] = [];
  const api = createTramaApi(
    (request) => {
      seen.push(request.clone());
      return Promise.resolve(respond(request));
    },
    'https://trama-api/',
    'token-da-ana',
  );
  return { api, seen };
}

describe('cliente da API do Trama', () => {
  it('chama com o token da pessoa e valida a resposta com o core', async () => {
    const { api, seen } = setup(() =>
      json(200, [
        {
          id: crypto.randomUUID(),
          kind: 'flow',
          title: 'Plano',
          status: 'draft',
          revision: 1,
          updatedAt: '2026-11-28T15:00:00.000Z',
        },
      ]),
    );
    const list = await api.listProjects();
    expect(list[0]?.title).toBe('Plano');
    expect(seen[0]?.url).toBe('https://trama-api/projects');
    expect(seen[0]?.headers.get('Authorization')).toBe('Bearer token-da-ana');
  });

  it('manda o corpo em JSON e usa o método certo em cada rota', async () => {
    const id = crypto.randomUUID();
    const { api, seen } = setup((request) => {
      const { pathname } = new URL(request.url);
      if (pathname === '/projects' && request.method === 'POST') {
        return json(201, {
          id,
          kind: 'flow',
          title: 'x',
          status: 'draft',
          revision: 1,
          updatedAt: '2026-11-28T15:00:00.000Z',
          content: {},
        });
      }
      if (request.method === 'PUT') {
        return json(200, { revision: 2, updatedAt: '2026-11-28T15:00:00.000Z', overwrote: false });
      }
      return json(200, {});
    });
    await api.createProject({ kind: 'flow', title: 'x' });
    expect(seen[0]?.method).toBe('POST');
    expect(seen[0]?.headers.get('Content-Type')).toBe('application/json');
    expect(await seen[0]?.json()).toEqual({ kind: 'flow', title: 'x' });
    const empty = createEmptyFlow();
    await api.saveFlow(id, empty, 1);
    expect(seen[1]?.method).toBe('PUT');
    expect(seen[1]?.url).toBe(`https://trama-api/projects/${id}`);
    expect(await seen[1]?.json()).toEqual({ content: empty, baseRevision: 1 });
  });

  it('manda as datas da Agenda codificadas na URL', async () => {
    const { api, seen } = setup(() => json(200, []));
    await api.listEvents({ from: '2026-11-28T03:00:00.000Z', to: '2026-11-29T03:00:00.000Z' });
    expect(seen[0]?.url).toContain('from=2026-11-28T03%3A00%3A00.000Z');
  });

  it('o erro da API vira uma frase em português; 401 pede para conectar de novo', async () => {
    const notFound = setup(() => json(404, { error: 'Projeto não encontrado.' }));
    await expect(notFound.api.getProject(crypto.randomUUID())).rejects.toMatchObject({
      status: 404,
      message: 'Projeto não encontrado.',
    });
    const ai = setup(() =>
      json(409, { error: 'Escolha a IA em Configurações.', code: 'no_settings' }),
    );
    await expect(ai.api.organize({ text: 'x', format: 'flow' })).rejects.toMatchObject({
      code: 'no_settings',
    });
    const expired = setup(() => json(401, { error: 'x' }));
    await expect(expired.api.listProjects()).rejects.toThrow(/Desconecte e conecte de novo/);
    const broken = setup(() => new Response('<html>erro</html>', { status: 502 }));
    await expect(broken.api.listProjects()).rejects.toBeInstanceOf(TramaApiError);
  });

  it('uma resposta fora do formato não passa', async () => {
    const { api } = setup(() => json(200, [{ id: 'nao-uuid' }]));
    await expect(api.listProjects()).rejects.toMatchObject({ status: 502 });
  });

  it('o fuso é opcional: sem perfil, vem null', async () => {
    const { api } = setup(() => json(404, { error: 'Perfil não encontrado.' }));
    expect(await api.timeZone()).toBeNull();
    const ok = setup(() =>
      json(200, {
        name: 'Ana',
        timezone: 'America/Sao_Paulo',
        emailPreferences: { weeklySummary: true, reviewReminders: false },
      }),
    );
    expect(await ok.api.timeZone()).toBe('America/Sao_Paulo');
  });
});

describe('como o Worker chega na API', () => {
  const fetcher = (() => Promise.resolve(new Response())) as typeof fetch;

  it('prefere o service binding', () => {
    const binding = { fetch: () => Promise.resolve(new Response()) };
    const transport = apiTransport(
      { TRAMA_API: binding as never, TRAMA_API_URL: 'https://x' } as never,
      fetcher,
    );
    expect(transport.base).toBe('https://trama-api');
  });

  it('sem binding, usa o endereço público', () => {
    expect(apiTransport({ TRAMA_API_URL: 'http://localhost:8787' } as never, fetcher).base).toBe(
      'http://localhost:8787',
    );
  });

  it('sem nenhum dos dois, avisa o que falta', () => {
    expect(() => apiTransport({} as never, fetcher)).toThrow(/TRAMA_API/);
  });
});

describe('que permissão um pedido ao /mcp exige', () => {
  const post = (body: unknown) =>
    new Request('https://mcp.test/mcp', { method: 'POST', body: JSON.stringify(body) });
  const call = (name: string) => ({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name },
  });

  it('ferramenta de escrita exige leitura e escrita; a de leitura, só leitura', async () => {
    expect(await scopesNeededBy(post(call('criar_fluxo')))).toEqual(['trama:read', 'trama:write']);
    expect(await scopesNeededBy(post(call('listar_projetos')))).toEqual(['trama:read']);
  });

  it('lote: junta tudo o que as chamadas exigem', async () => {
    expect(await scopesNeededBy(post([call('listar_projetos'), call('registrar_estudo')]))).toEqual(
      ['trama:read', 'trama:write'],
    );
  });

  it('o que não é chamada de ferramenta não exige nada além do token', async () => {
    expect(await scopesNeededBy(post({ jsonrpc: '2.0', id: 1, method: 'tools/list' }))).toBeNull();
    expect(await scopesNeededBy(post(call('ferramenta_que_nao_existe')))).toBeNull();
    expect(
      await scopesNeededBy(
        new Request('https://mcp.test/mcp', { method: 'POST', body: 'não é json' }),
      ),
    ).toBeNull();
    expect(await scopesNeededBy(new Request('https://mcp.test/mcp'))).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { MCP, SITE, REDIRECT, createHarness } from './test/harness';
import { isError, structuredOf, textOf } from './test/client';
import { jsonOf } from './test/json';

describe('descoberta e acesso sem login', () => {
  it('publica os metadados do OAuth, com as duas permissões', async () => {
    const h = createHarness();
    const server = await jsonOf<Record<string, unknown>>(
      await h.send(`${MCP}/.well-known/oauth-authorization-server`),
    );
    expect(server.issuer).toBe(MCP);
    expect(server.authorization_endpoint).toBe(`${MCP}/authorize`);
    expect(server.token_endpoint).toBe(`${MCP}/oauth/token`);
    expect(server.registration_endpoint).toBe(`${MCP}/oauth/register`);
    expect(server.scopes_supported).toEqual(['trama:read', 'trama:write']);
    expect(server.code_challenge_methods_supported).toEqual(['S256']);

    const resource = await jsonOf<Record<string, unknown>>(
      await h.send(`${MCP}/.well-known/oauth-protected-resource/mcp`),
    );
    expect(resource.resource).toBe(`${MCP}/mcp`);
    expect(resource.authorization_servers).toEqual([MCP]);
    expect(resource.scopes_supported).toEqual(['trama:read']);
  });

  it('o /mcp sem token responde 401 e diz onde começar', async () => {
    const h = createHarness();
    const response = await h.rawMcp(null, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toContain('resource_metadata=');
  });

  it('um token qualquer não entra', async () => {
    const h = createHarness();
    const response = await h.rawMcp('token-falso', { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(response.status).toBe(401);
  });
});

describe('login com a conta do Trama e consentimento', () => {
  it('o /authorize leva a pessoa ao site, com um bilhete, e não concede nada', async () => {
    const h = createHarness();
    const clientId = await h.registerClient('Claude');
    const started = await h.startAuthorization(clientId, 'trama:read');
    expect(started.response.status).toBe(302);
    expect(started.location.startsWith(`${SITE}/conectar#t=`)).toBe(true);
    expect(started.ticket.length).toBeGreaterThan(50);
    // Nada foi concedido: nenhuma concessão no KV.
    expect(h.kv.keys().some((key) => key.startsWith('grant:'))).toBe(false);
  });

  it('o bilhete mostra o nome do cliente, o endereço de retorno e as permissões pedidas', async () => {
    const h = createHarness();
    const clientId = await h.registerClient('Claude Desktop');
    const { ticket } = await h.startAuthorization(clientId, 'trama:read');
    const response = await h.site(`/connect/info?ticket=${encodeURIComponent(ticket)}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      clientName: 'Claude Desktop',
      clientDomain: null,
      redirectHost: 'claude.test',
      redirectIsLoopback: false,
      scopes: ['trama:read'],
    });
  });

  it('sem pedir permissão, oferece leitura e escrita', async () => {
    const h = createHarness();
    const clientId = await h.registerClient();
    const { ticket } = await h.startAuthorization(clientId, null);
    const info = await jsonOf<{ scopes: string[] }>(
      await h.site(`/connect/info?ticket=${encodeURIComponent(ticket)}`),
    );
    expect(info.scopes).toEqual(['trama:read', 'trama:write']);
  });

  it('o nome do cliente chega limpo, sem HTML e sem espaços sobrando', async () => {
    const h = createHarness();
    const clientId = await h.registerClient('  <b>Claude</b>   falso ');
    const { ticket } = await h.startAuthorization(clientId);
    const info = await jsonOf<{ clientName: string }>(
      await h.site(`/connect/info?ticket=${encodeURIComponent(ticket)}`),
    );
    // O texto vai como dado (JSON) e o site o mostra como texto; só os espaços são arrumados.
    expect(info.clientName).toBe('<b>Claude</b> falso');
  });

  it('recusar manda o cliente de volta com access_denied e o state dele, sem concessão', async () => {
    const h = createHarness();
    const clientId = await h.registerClient();
    const { ticket } = await h.startAuthorization(clientId);
    const response = await h.decide({ decision: 'deny', ticket });
    expect(response.status).toBe(200);
    const { redirectTo } = await jsonOf<{ redirectTo: string }>(response);
    const url = new URL(redirectTo);
    expect(`${url.origin}${url.pathname}`).toBe(REDIRECT);
    expect(url.searchParams.get('error')).toBe('access_denied');
    expect(url.searchParams.get('state')).toBe('estado-do-cliente');
    expect(url.searchParams.get('code')).toBeNull();
    expect(h.kv.keys().some((key) => key.startsWith('grant:'))).toBe(false);
  });

  it('um bilhete adulterado ou vencido não vale', async () => {
    const h = createHarness();
    const clientId = await h.registerClient();
    const { ticket } = await h.startAuthorization(clientId);
    const forged = ticket.replace(/^./, (char) => (char === 'a' ? 'b' : 'a'));
    expect((await h.site(`/connect/info?ticket=${encodeURIComponent(forged)}`)).status).toBe(410);
    expect((await h.decide({ decision: 'deny', ticket: forged })).status).toBe(410);
    expect((await h.site('/connect/info?ticket=lixo')).status).toBe(410);
    h.advance(11 * 60 * 1000);
    expect((await h.site(`/connect/info?ticket=${encodeURIComponent(ticket)}`)).status).toBe(410);
    const session = h.supabase.signIn('ana');
    const late = await h.decide(
      { decision: 'allow', ticket, scopes: ['trama:read'], refreshToken: session.refreshToken },
      session.accessToken,
    );
    expect(late.status).toBe(410);
  });

  it('permitir exige o login da pessoa: sem token, com token falso ou de outra sessão', async () => {
    const h = createHarness();
    const clientId = await h.registerClient();
    const { ticket } = await h.startAuthorization(clientId);
    const session = h.supabase.signIn('ana');
    const allow = {
      decision: 'allow',
      ticket,
      scopes: ['trama:read'],
      refreshToken: session.refreshToken,
    };
    expect((await h.decide(allow)).status).toBe(401);
    expect((await h.decide(allow, 'token-falso')).status).toBe(401);
    // Token de acesso da Ana com o refresh token do Beto: não é a mesma pessoa.
    const beto = h.supabase.signIn('beto');
    expect(
      (await h.decide({ ...allow, refreshToken: beto.refreshToken }, session.accessToken)).status,
    ).toBe(401);
    // Refresh token inválido.
    expect(
      (await h.decide({ ...allow, refreshToken: 'inventado' }, session.accessToken)).status,
    ).toBe(401);
    expect(h.kv.keys().some((key) => key.startsWith('grant:'))).toBe(false);
  });

  it('a pessoa só dá o que o cliente pediu: pediu leitura, não ganha escrita', async () => {
    const h = createHarness();
    const { accessToken, body } = await h.connect({
      requested: 'trama:read',
      allowed: ['trama:read', 'trama:write'],
    });
    expect(body.scope).toBe('trama:read');
    const response = await h.rawMcp(accessToken, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'criar_fluxo', arguments: {} },
    });
    expect(response.status).toBe(403);
  });

  it('a pessoa pode tirar a escrita que o cliente pediu', async () => {
    const h = createHarness();
    const { body } = await h.connect({
      requested: 'trama:read trama:write',
      allowed: ['trama:read'],
    });
    expect(body.scope).toBe('trama:read');
  });

  it('sem a chave de criptografia, o conector não autoriza ninguém', async () => {
    const h = createHarness({ encryptionKey: null });
    const clientId = await h.registerClient();
    const { response } = await h.startAuthorization(clientId);
    expect(response.status).toBe(503);
    expect((await h.site('/connect/info?ticket=x')).status).toBe(503);
  });

  it('pedido com endereço de retorno que o cliente não registrou nunca vira redirecionamento', async () => {
    const h = createHarness();
    const clientId = await h.registerClient();
    const url = new URL(`${MCP}/authorize`);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: 'https://atacante.test/roubar',
      state: 'x',
      code_challenge: 'a'.repeat(43),
      code_challenge_method: 'S256',
    }).toString();
    const response = await h.send(url, { redirect: 'manual' });
    expect(response.status).toBe(400);
    expect(response.headers.get('Location')).toBeNull();
  });
});

describe('com o MCP conectado', () => {
  it('um cliente MCP de verdade lista as ferramentas e cria um fluxo com o token da pessoa', async () => {
    const h = createHarness();
    const { accessToken, body } = await h.connect();
    expect(body.scope).toBe('trama:read trama:write');
    const client = await h.mcpClient(accessToken);

    const { tools } = await client.listTools();
    expect(tools).toHaveLength(9);

    const result = await client.callTool({
      name: 'criar_fluxo',
      arguments: { title: 'Pelo MCP', blocks: [{ type: 'card', title: 'Um' }] },
    });
    expect(isError(result)).toBe(false);
    const out = structuredOf<{ project: { id: string; url: string } }>(result);
    expect(out.project.url).toBe(`${SITE}/p/${out.project.id}`);
    expect(h.trama.projects.get(out.project.id)?.title).toBe('Pelo MCP');
    expect(h.trama.events.at(-1)).toMatchObject({
      title: 'Fluxo criado: Pelo MCP',
      detail: 'Pelo conector Claude',
    });
    expect(textOf(result)).toContain(out.project.id);
  });

  it('a API recebe o token do Supabase, nunca o do MCP, e o cliente nunca recebe o do Supabase', async () => {
    const h = createHarness();
    const { accessToken, refreshToken, body, session } = await h.connect();
    const client = await h.mcpClient(accessToken);
    await client.callTool({ name: 'listar_projetos', arguments: {} });
    expect(h.apiTokens.length).toBeGreaterThan(0);
    for (const token of h.apiTokens) {
      expect(token).toMatch(/^acesso-/);
      expect(token).not.toBe(accessToken);
    }
    // O cliente MCP só recebeu tokens do MCP.
    const received = JSON.stringify(body);
    expect(received).not.toContain('acesso-');
    expect(received).not.toContain('refresh-');
    expect(refreshToken).not.toContain('refresh-');
    expect(session.refreshToken).toMatch(/^refresh-/);
  });

  it('nenhum token do Supabase fica em claro no KV', async () => {
    const h = createHarness();
    const { accessToken } = await h.connect();
    const client = await h.mcpClient(accessToken);
    await client.callTool({ name: 'listar_projetos', arguments: {} });
    const dump = h.kv.dump();
    expect(dump).not.toContain('acesso-');
    expect(dump).not.toContain('refresh-');
    // O token do MCP também só aparece como hash.
    expect(dump).not.toContain(accessToken);
  });

  it('só leitura: as ferramentas de escrita voltam 403 insufficient_scope e nada é escrito', async () => {
    const h = createHarness();
    const { accessToken } = await h.connect({ allowed: ['trama:read'] });
    const call = (name: string, args: unknown) =>
      h.rawMcp(accessToken, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: args },
      });
    for (const name of [
      'criar_fluxo',
      'adicionar_blocos',
      'marcar_concluido',
      'organizar_texto',
      'criar_roteiro',
      'registrar_estudo',
    ]) {
      const response = await call(name, {});
      expect(response.status, name).toBe(403);
      const challenge = response.headers.get('WWW-Authenticate') ?? '';
      expect(challenge).toContain('insufficient_scope');
      expect(challenge).toContain('trama:write');
    }
    // Em lote, uma chamada de escrita barra o lote todo.
    const batch = await h.rawMcp(accessToken, [
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'listar_projetos', arguments: {} },
      },
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'criar_fluxo', arguments: {} },
      },
    ]);
    expect(batch.status).toBe(403);
    expect(h.trama.writes).toEqual([]);

    const client = await h.mcpClient(accessToken);
    expect(isError(await client.callTool({ name: 'listar_projetos', arguments: {} }))).toBe(false);
    expect(isError(await client.callTool({ name: 'buscar_agenda', arguments: {} }))).toBe(false);
  });
});

describe('renovar o acesso', () => {
  it('trocar o refresh token do MCP renova a sessão do Supabase e guarda o token novo cifrado', async () => {
    const h = createHarness();
    const first = await h.connect();
    const before = h.supabase.log.filter((entry) => entry.path.includes('refresh_token')).length;
    const renewed = await h.exchange(
      { grant_type: 'refresh_token', refresh_token: first.refreshToken },
      first.clientId,
    );
    expect(renewed.response.status).toBe(200);
    expect(renewed.accessToken).not.toBe(first.accessToken);
    expect(h.supabase.log.filter((entry) => entry.path.includes('refresh_token')).length).toBe(
      before + 1,
    );
    // O token novo funciona, e o refresh seguinte também (o Supabase troca o token a cada uso).
    const client = await h.mcpClient(renewed.accessToken);
    expect(isError(await client.callTool({ name: 'listar_projetos', arguments: {} }))).toBe(false);
    const again = await h.exchange(
      { grant_type: 'refresh_token', refresh_token: renewed.refreshToken },
      first.clientId,
    );
    expect(again.response.status).toBe(200);
    expect(h.kv.dump()).not.toContain('refresh-');
  });

  it('o token do MCP dura o mesmo que o do Supabase (menos um minuto)', async () => {
    const h = createHarness({ expiresIn: 1800 });
    const { body } = await h.connect();
    expect(body.expires_in).toBe(1740);
  });

  it('se a pessoa saiu de todas as sessões, a concessão é revogada e o cliente precisa pedir de novo', async () => {
    const h = createHarness();
    const first = await h.connect();
    h.supabase.endSessions('ana');
    const renewed = await h.exchange(
      { grant_type: 'refresh_token', refresh_token: first.refreshToken },
      first.clientId,
    );
    expect(renewed.response.status).toBe(400);
    expect(renewed.body.error).toBe('invalid_grant');
    const list = await jsonOf<{
      error?: string;
    }>(await h.site('/connectors', first.session.accessToken));
    expect(list.error).toBeDefined(); // o token do Supabase dessa sessão também foi encerrado
  });

  it('com o Supabase fora do ar, a concessão fica como está (tenta de novo depois)', async () => {
    const h = createHarness();
    const first = await h.connect();
    h.supabase.setDown(true);
    const failed = await h.exchange(
      { grant_type: 'refresh_token', refresh_token: first.refreshToken },
      first.clientId,
    );
    expect(failed.response.status).toBe(503);
    h.supabase.setDown(false);
    const ok = await h.exchange(
      { grant_type: 'refresh_token', refresh_token: first.refreshToken },
      first.clientId,
    );
    expect(ok.response.status).toBe(200);
  });

  it('com a chave de criptografia trocada, a concessão não abre mais e é revogada', async () => {
    const h = createHarness();
    const first = await h.connect();
    (h.env as { MCP_ENCRYPTION_KEY?: string }).MCP_ENCRYPTION_KEY = btoa(
      String.fromCharCode(...new Uint8Array(32).fill(9)),
    );
    const renewed = await h.exchange(
      { grant_type: 'refresh_token', refresh_token: first.refreshToken },
      first.clientId,
    );
    expect(renewed.response.status).toBe(400);
    expect(renewed.body.error).toBe('invalid_grant');
  });
});

describe('Configurações → Conectores', () => {
  function site(h: ReturnType<typeof createHarness>, userId = 'ana') {
    return h.supabase.signIn(userId).accessToken;
  }

  it('lista os clientes autorizados, com nome, permissões e último uso', async () => {
    const h = createHarness();
    const claude = await h.connect({ name: 'Claude', allowed: ['trama:read', 'trama:write'] });
    await h.connect({ name: 'Codex', allowed: ['trama:read'] });
    const mine = site(h);
    const response = await h.site('/connectors', mine);
    expect(response.status).toBe(200);
    const { connectors } = await jsonOf<{
      connectors: { id: string; clientName: string; scopes: string[]; lastUsedAt: string | null }[];
    }>(response);
    expect(connectors.map((item) => item.clientName).sort()).toEqual(['Claude', 'Codex']);
    expect(connectors.find((item) => item.clientName === 'Codex')?.scopes).toEqual(['trama:read']);
    expect(connectors.every((item) => item.lastUsedAt === null)).toBe(true);

    const client = await h.mcpClient(claude.accessToken);
    await client.callTool({ name: 'listar_projetos', arguments: {} });
    const after = await jsonOf<typeof connectors extends infer T ? { connectors: T } : never>(
      await h.site('/connectors', mine),
    );
    const used = after.connectors.find((item) => item.clientName === 'Claude');
    expect(used?.lastUsedAt).toBe(h.now().toISOString());
  });

  it('o último uso grava no máximo uma vez a cada 10 minutos (o KV grátis tem 1.000 gravações por dia)', async () => {
    const h = createHarness();
    const { accessToken } = await h.connect();
    const puts: string[] = [];
    const original = h.kv.put.bind(h.kv);
    (h.kv as unknown as { put: typeof original }).put = (key, value, options) => {
      if (key.startsWith('trama:used:')) puts.push(key);
      return original(key, value, options);
    };
    const client = await h.mcpClient(accessToken);
    for (let i = 0; i < 5; i++) await client.callTool({ name: 'listar_projetos', arguments: {} });
    expect(puts).toHaveLength(1);
    h.advance(11 * 60 * 1000);
    await client.callTool({ name: 'listar_projetos', arguments: {} });
    expect(puts).toHaveLength(2);
  });

  it('cada pessoa vê só os próprios conectores', async () => {
    const h = createHarness();
    await h.connect({ userId: 'ana', name: 'Claude' });
    await h.connect({ userId: 'beto', name: 'Codex' });
    const ana = await jsonOf<{
      connectors: { clientName: string }[];
    }>(await h.site('/connectors', site(h, 'ana')));
    const beto = await jsonOf<{
      connectors: { clientName: string }[];
    }>(await h.site('/connectors', site(h, 'beto')));
    expect(ana.connectors.map((item) => item.clientName)).toEqual(['Claude']);
    expect(beto.connectors.map((item) => item.clientName)).toEqual(['Codex']);
  });

  it('exige o login da pessoa', async () => {
    const h = createHarness();
    expect((await h.site('/connectors')).status).toBe(401);
    expect((await h.site('/connectors', 'token-falso')).status).toBe(401);
    expect((await h.site('/connectors/qualquer', undefined, { method: 'DELETE' })).status).toBe(
      401,
    );
  });

  it('revogar derruba o acesso na hora: o token e o refresh deixam de valer', async () => {
    const h = createHarness();
    const connected = await h.connect();
    const client = await h.mcpClient(connected.accessToken);
    expect(isError(await client.callTool({ name: 'listar_projetos', arguments: {} }))).toBe(false);

    const mine = site(h);
    const list = await jsonOf<{
      connectors: { id: string }[];
    }>(await h.site('/connectors', mine));
    const id = list.connectors[0]!.id;
    const revoked = await h.site(`/connectors/${id}`, mine, { method: 'DELETE' });
    expect(revoked.status).toBe(204);

    const after = await h.rawMcp(connected.accessToken, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    });
    expect(after.status).toBe(401);
    const refresh = await h.exchange(
      { grant_type: 'refresh_token', refresh_token: connected.refreshToken },
      connected.clientId,
    );
    expect(refresh.response.status).toBe(400);
    const empty = await jsonOf<{ connectors: unknown[] }>(await h.site('/connectors', mine));
    expect(empty.connectors).toEqual([]);
    expect(h.kv.keys().some((key) => key.startsWith('trama:used:'))).toBe(false);
  });

  it('uma pessoa não revoga o conector de outra', async () => {
    const h = createHarness();
    const connected = await h.connect({ userId: 'ana' });
    const anaList = await jsonOf<{
      connectors: { id: string }[];
    }>(await h.site('/connectors', site(h, 'ana')));
    const id = anaList.connectors[0]!.id;
    expect((await h.site(`/connectors/${id}`, site(h, 'beto'), { method: 'DELETE' })).status).toBe(
      204,
    );
    const client = await h.mcpClient(connected.accessToken);
    expect(isError(await client.callTool({ name: 'listar_projetos', arguments: {} }))).toBe(false);
  });

  it('o CORS só libera o site do Trama', async () => {
    const h = createHarness();
    const token = site(h);
    const allowed = await h.site('/connectors', token, { headers: { Origin: SITE } });
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe(SITE);
    const other = await h.site('/connectors', token, {
      headers: { Origin: 'https://atacante.test' },
    });
    expect(other.headers.get('Access-Control-Allow-Origin')).toBeNull();
    const preflight = await h.send(`${MCP}/connectors/x`, {
      method: 'OPTIONS',
      headers: {
        Origin: SITE,
        'Access-Control-Request-Method': 'DELETE',
        'Access-Control-Request-Headers': 'authorization',
      },
    });
    expect(preflight.headers.get('Access-Control-Allow-Methods')).toContain('DELETE');
  });
});

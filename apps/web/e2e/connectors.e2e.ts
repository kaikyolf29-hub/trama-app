import { expect, test } from './support/fixtures';
import { API_URL } from './support/api';
import { mockSupabaseAuth, testUser } from './support/auth';
import { CLIENT_CALLBACK, FakeMcp, consentInfo } from './support/mcp';

test.describe('Conectores (MCP)', () => {
  let mcp: FakeMcp;

  test.beforeEach(async ({ page, signIn }) => {
    mcp = new FakeMcp();
    await mcp.attach(page);
    await signIn();
  });

  test('consentimento: mostra quem pede, pede a senha e devolve a pessoa ao cliente', async ({
    page,
  }) => {
    const auth = await mockSupabaseAuth(page);
    await page.goto('/conectar#t=bilhete-e2e');

    await expect(
      page.getByRole('heading', { name: 'Permitir que Claude use o seu Trama?' }),
    ).toBeVisible();
    await expect(page.getByText('claude.test', { exact: true })).toBeVisible();
    await expect(page.getByText('Leitura', { exact: true })).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Escrita' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    // O bilhete foi para o conector (e nada além do bilhete).
    expect(mcp.calls.find((call) => call.path.startsWith('/connect/info'))?.path).toBe(
      '/connect/info?ticket=bilhete-e2e',
    );

    // Sem senha, não concede.
    await page.getByRole('button', { name: 'Permitir' }).click();
    await expect(page.getByText('Digite a sua senha para confirmar.')).toBeVisible();
    expect(mcp.calls.some((call) => call.path === '/connect/decision')).toBe(false);

    await page.getByLabel('Confirme a sua senha').fill('senha-certa-123');
    await page.getByRole('button', { name: 'Permitir' }).click();
    await expect(page).toHaveURL(`${CLIENT_CALLBACK}?code=codigo&state=estado`);
    await expect(page.getByRole('heading', { name: 'Voltou ao cliente' })).toBeVisible();

    // A senha só foi ao Supabase (login separado); ao conector foi a sessão nova, não a senha.
    expect(auth.signInBodies).toEqual([
      expect.objectContaining({ email: testUser.email, password: 'senha-certa-123' }),
    ]);
    const decision = mcp.calls.find((call) => call.path === '/connect/decision');
    expect(JSON.stringify(decision?.body)).not.toContain('senha-certa-123');
    expect(decision?.body).toMatchObject({
      decision: 'allow',
      ticket: 'bilhete-e2e',
      scopes: ['trama:read', 'trama:write'],
    });
  });

  test('a pessoa tira a escrita e só a leitura é concedida', async ({ page }) => {
    await mockSupabaseAuth(page);
    await page.goto('/conectar#t=bilhete-e2e');
    await page.getByRole('switch', { name: 'Escrita' }).click();
    await page.getByLabel('Confirme a sua senha').fill('senha-certa-123');
    await page.getByRole('button', { name: 'Permitir' }).click();
    await expect(page).toHaveURL(/claude\.test\/callback\?code=/);
    expect(mcp.calls.find((call) => call.path === '/connect/decision')?.body).toMatchObject({
      scopes: ['trama:read'],
    });
  });

  test('senha errada não concede nada', async ({ page }) => {
    await mockSupabaseAuth(page);
    await page.goto('/conectar#t=bilhete-e2e');
    await page.getByLabel('Confirme a sua senha').fill('senha-errada');
    await page.getByRole('button', { name: 'Permitir' }).click();
    await expect(page.getByText('E-mail ou senha incorretos.')).toBeVisible();
    expect(mcp.calls.some((call) => call.path === '/connect/decision')).toBe(false);
    await expect(page).toHaveURL(/\/conectar/);
  });

  test('recusar volta ao cliente com o erro, sem pedir senha', async ({ page }) => {
    await page.goto('/conectar#t=bilhete-e2e');
    await page.getByRole('button', { name: 'Recusar' }).click();
    await expect(page).toHaveURL(`${CLIENT_CALLBACK}?error=access_denied&state=estado`);
  });

  test('aviso quando o retorno é um app no computador, e o nome nunca vira HTML', async ({
    page,
  }) => {
    mcp.consent = {
      ...consentInfo,
      clientName: '<script>alert(1)</script> Claude',
      redirectHost: 'localhost',
      redirectIsLoopback: true,
      scopes: ['trama:read'],
    };
    await page.goto('/conectar#t=bilhete-e2e');
    await expect(page.getByText(/no seu próprio computador/)).toBeVisible();
    await expect(page.getByRole('switch')).toHaveCount(0);
    await expect(page.getByText('<script>alert(1)</script> Claude').first()).toBeVisible();
  });

  test('pedido vencido explica o que fazer', async ({ page }) => {
    await page.goto('/conectar#t=velho');
    await expect(page.getByText(/Este pedido venceu/)).toBeVisible();
  });

  test('quem não está logado entra e volta para o consentimento com o bilhete', async ({
    browser,
  }) => {
    // Contexto novo: sem a sessão falsa do beforeEach.
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.route('https://jebksiyftodpbvhndoqf.supabase.co/**', (route) =>
      route.abort('blockedbyclient'),
    );
    await new FakeMcp().attach(page);
    await mockSupabaseAuth(page);
    await page.goto('/conectar#t=bilhete-e2e');
    await expect(page).toHaveURL(/\/entrar/);
    await page.getByLabel('E-mail').fill(testUser.email);
    await page.getByLabel('Senha', { exact: true }).fill('senha-certa-123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/conectar#t=bilhete-e2e/);
    await expect(page.getByRole('heading', { name: /Permitir que/ })).toBeVisible();
    await context.close();
  });

  test('Configurações → Conectores: lista, mostra o último uso e revoga', async ({ page }) => {
    mcp.connectors = [
      {
        id: 'g1',
        clientName: 'Claude',
        clientDomain: null,
        scopes: ['trama:read', 'trama:write'],
        createdAt: '2026-11-20T12:00:00.000Z',
        lastUsedAt: null,
      },
      {
        id: 'g2',
        clientName: 'Codex',
        clientDomain: null,
        scopes: ['trama:read'],
        createdAt: '2026-11-21T12:00:00.000Z',
        lastUsedAt: '2026-11-21T12:00:00.000Z',
      },
    ];
    // O perfil de Configurações (a API de projetos do FakeApi não o simula).
    await page.route(`${API_URL}/account/profile`, (route) =>
      route.fulfill({
        status: 200,
        headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
        body: JSON.stringify({
          name: testUser.name,
          timezone: 'America/Sao_Paulo',
          emailPreferences: { weeklySummary: true, reviewReminders: false },
        }),
      }),
    );
    await page.goto('/configuracoes');
    const section = page.getByRole('region', { name: 'Conectores' });
    await expect(section.getByText('http://localhost:8788/mcp')).toBeVisible();
    await expect(section.getByText('Leitura e escrita · Ainda não usado')).toBeVisible();
    await expect(section.getByText(/Só leitura · Último uso/)).toBeVisible();

    await section.getByRole('button', { name: 'Revogar Claude' }).click();
    await section.getByRole('button', { name: 'Sim, revogar' }).click();
    await expect(section.getByText('Claude', { exact: true })).toHaveCount(0);
    await expect(section.getByText('Codex', { exact: true })).toBeVisible();
    const revoke = mcp.calls.find((call) => call.method === 'DELETE');
    expect(revoke?.path).toBe('/connectors/g1');
    expect(revoke?.authorization).toMatch(/^Bearer /);
  });
});

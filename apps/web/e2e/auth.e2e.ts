import { mockSupabaseAuth, testUser } from './support/auth';
import { expect, test } from './support/fixtures';

test.describe('rotas protegidas', () => {
  test('sem login, o início manda para a entrada e guarda para onde voltar', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/entrar\?volta=%2F$/);
    await expect(page.getByRole('heading', { name: 'Entrar no Trama' })).toBeVisible();
  });

  test('sem login, um projeto manda para a entrada e volta para ele depois do login', async ({
    page,
    api,
  }) => {
    const project = api.seed({ title: 'Aula 1' });
    await mockSupabaseAuth(page);
    await page.goto(`/p/${project.id}`);
    await expect(page).toHaveURL(/\/entrar\?volta=/);

    await page.getByLabel('E-mail').fill(testUser.email);
    await page.getByLabel('Senha', { exact: true }).fill('senha-certa-123');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();

    await expect(page).toHaveURL(`/p/${project.id}`);
    await expect(page.getByRole('heading', { name: 'Aula 1' })).toBeVisible();
  });

  test('com login, a entrada e o cadastro mandam para o início', async ({ page, signIn }) => {
    await signIn();
    await page.goto('/entrar');
    await expect(page).toHaveURL('/');
    await page.goto('/criar-conta');
    await expect(page).toHaveURL('/');
  });

  test('o quadro de exemplo abre sem login', async ({ page }) => {
    await page.goto('/exemplo');
    await expect(page.getByTestId('quadro')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Como editar 10x mais rápido' })).toBeVisible();
  });
});

test.describe('entrar', () => {
  test('entra com e-mail e senha e cai no início com o nome da pessoa', async ({ page, api }) => {
    const auth = await mockSupabaseAuth(page);
    await page.goto('/entrar');
    await page.getByLabel('E-mail').fill(testUser.email);
    await page.getByLabel('Senha', { exact: true }).fill('senha-certa-123');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Ana');
    expect(auth.signInBodies).toEqual([
      expect.objectContaining({ email: testUser.email, password: 'senha-certa-123' }),
    ]);
    // A lista do início já foi buscada com o token da sessão.
    await expect.poll(() => api.callsTo('GET', '/projects').length).toBeGreaterThan(0);
    expect(api.callsTo('GET', '/projects')[0]?.authorization).toMatch(/^Bearer .+/);
  });

  test('senha errada mostra o erro em português e continua na entrada', async ({ page }) => {
    await mockSupabaseAuth(page);
    await page.goto('/entrar');
    await page.getByLabel('E-mail').fill(testUser.email);
    await page.getByLabel('Senha', { exact: true }).fill('senha-errada-999');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();

    await expect(page.getByRole('alert')).toContainText('E-mail ou senha');
    await expect(page).toHaveURL(/\/entrar/);
  });

  test('campos vazios não chamam o Supabase e mostram o que falta', async ({ page }) => {
    const auth = await mockSupabaseAuth(page);
    await page.goto('/entrar');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Entrar no Trama' })).toBeVisible();
    expect(auth.signInBodies).toEqual([]);
    await expect(page.getByText(/e-mail/i).first()).toBeVisible();
  });

  test('Sair volta para a entrada', async ({ page, signIn }) => {
    await mockSupabaseAuth(page);
    await signIn();
    await page.goto('/');
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page).toHaveURL(/\/entrar/);
  });
});

test.describe('criar conta', () => {
  test('com confirmação por e-mail, mostra "Confira o seu e-mail"', async ({ page }) => {
    const auth = await mockSupabaseAuth(page, { signUpNeedsConfirmation: true });
    await page.goto('/criar-conta');
    await page.getByLabel('Nome').fill('Bia Lima');
    await page.getByLabel('E-mail').fill('bia@exemplo.com');
    await page.getByLabel('Senha', { exact: true }).fill('uma-senha-longa');
    await page.getByRole('button', { name: 'Criar conta', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Confira o seu e-mail' })).toBeVisible();
    await expect(page.getByText('bia@exemplo.com')).toBeVisible();
    expect(auth.signUpBodies).toEqual([
      expect.objectContaining({
        email: 'bia@exemplo.com',
        data: expect.objectContaining({ name: 'Bia Lima' }),
      }),
    ]);
  });

  test('sem confirmação, já entra no início', async ({ page }) => {
    await mockSupabaseAuth(page, { signUpNeedsConfirmation: false });
    await page.goto('/criar-conta');
    await page.getByLabel('Nome').fill('Bia Lima');
    await page.getByLabel('E-mail').fill('bia@exemplo.com');
    await page.getByLabel('Senha', { exact: true }).fill('uma-senha-longa');
    await page.getByRole('button', { name: 'Criar conta', exact: true }).click();

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Bia');
  });

  test('senha curta é recusada antes de chamar o Supabase', async ({ page }) => {
    const auth = await mockSupabaseAuth(page);
    await page.goto('/criar-conta');
    await page.getByLabel('Nome').fill('Bia Lima');
    await page.getByLabel('E-mail').fill('bia@exemplo.com');
    await page.getByLabel('Senha', { exact: true }).fill('curta');
    await page.getByRole('button', { name: 'Criar conta', exact: true }).click();

    await expect(page.getByText(/pelo menos 8/i).last()).toBeVisible();
    expect(auth.signUpBodies).toEqual([]);
  });
});

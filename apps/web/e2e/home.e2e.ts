import { projectTemplates } from '@trama/core';
import { expect, test } from './support/fixtures';

test.describe('tela Início: modelos', () => {
  test('mostra a saudação, os seis modelos e a lista vazia', async ({ page, api, signIn }) => {
    await signIn();
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Ana');
    for (const template of projectTemplates) {
      await expect(page.getByRole('button', { name: new RegExp(template.title) })).toBeVisible();
    }
    expect(projectTemplates).toHaveLength(6);
    await expect(page.getByText('Nenhum projeto ainda')).toBeVisible();
    expect(api.projects.size).toBe(0);
  });

  // "Falar e organizar" abre a tela de voz, não o quadro (veja voice.e2e.ts).
  for (const template of projectTemplates.filter((item) => item.id !== 'voice')) {
    test(`"${template.title}" cria o projeto e abre no quadro`, async ({ page, api, signIn }) => {
      await signIn();
      await page.goto('/');
      await page.getByRole('button', { name: new RegExp(template.title) }).click();

      await expect(page).toHaveURL(/\/p\/[0-9a-f-]{36}$/);
      expect(api.callsTo('POST', '/projects')).toHaveLength(1);
      const [project] = [...api.projects.values()];
      expect(project?.title).toBe(template.projectTitle);
      await expect(page).toHaveURL(`/p/${project?.id}`);

      if (template.kind === 'script') {
        // O roteiro abre no editor de texto, com as cenas do modelo.
        expect(project?.kind).toBe('script');
        await expect(page.getByRole('textbox', { name: 'Título do roteiro' })).toHaveValue(
          template.projectTitle,
        );
        await expect(page.getByRole('textbox', { name: 'Texto do roteiro' })).toContainText(
          template.content().scenes[0]?.title ?? '',
        );
        await expect(page.getByRole('status').filter({ hasText: 'Salvo' })).toBeVisible();
        return;
      }

      // O quadro abre com o que o modelo traz, no título e nos blocos.
      await expect(page.getByTestId('quadro')).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(template.projectTitle);
      const expected = template.content();
      await expect(page.locator('.react-flow__node')).toHaveCount(
        expected.blocks.length + expected.frames.length,
      );
      await expect(page.getByRole('status').filter({ hasText: 'Salvo' })).toBeVisible();
    });
  }

  test('erro ao criar mostra o aviso e fica no Início', async ({ page, api, signIn }) => {
    await signIn();
    api.failNext('POST /projects', 500, 'Não deu para criar agora.');
    await page.goto('/');
    await page.getByRole('button', { name: /Fluxo em branco/ }).click();
    await expect(page.getByRole('alert')).toContainText('Não deu para criar agora.');
    await expect(page).toHaveURL('/');
  });
});

test.describe('tela Início: recentes', () => {
  test('lista do mais recente para o mais antigo e abre o projeto no clique', async ({
    page,
    api,
    signIn,
  }) => {
    await signIn();
    api.seed({ title: 'Primeiro' });
    const second = api.seed({ title: 'Segundo' });
    await page.goto('/');
    const rows = page.getByRole('row');
    await expect(rows.nth(1)).toContainText('Segundo');
    await expect(rows.nth(2)).toContainText('Primeiro');

    await page.getByRole('link', { name: 'Segundo' }).click();
    await expect(page).toHaveURL(`/p/${second.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Segundo');
  });

  test('renomeia com Enter e manda só o título no PATCH', async ({ page, api, signIn }) => {
    await signIn();
    const project = api.seed({ title: 'Nome antigo' });
    await page.goto('/');
    await page.getByRole('button', { name: 'Renomear Nome antigo' }).click();
    const field = page.getByLabel('Novo nome');
    await field.fill('Nome novo');
    await field.press('Enter');

    await expect(page.getByRole('link', { name: 'Nome novo' })).toBeVisible();
    expect(api.callsTo('PATCH', `/projects/${project.id}`).map((call) => call.body)).toEqual([
      { title: 'Nome novo' },
    ]);
    expect(api.projects.get(project.id)?.title).toBe('Nome novo');
    // Renomear não mexe na revisão (o salvamento do quadro aberto em outra aba segue valendo).
    expect(api.projects.get(project.id)?.revision).toBe(1);
  });

  test('Esc cancela a renomeação sem chamar a API', async ({ page, api, signIn }) => {
    await signIn();
    const project = api.seed({ title: 'Fica assim' });
    await page.goto('/');
    await page.getByRole('button', { name: 'Renomear Fica assim' }).click();
    const field = page.getByLabel('Novo nome');
    await field.fill('Outro');
    await field.press('Escape');

    await expect(page.getByRole('link', { name: 'Fica assim' })).toBeVisible();
    expect(api.callsTo('PATCH', `/projects/${project.id}`)).toHaveLength(0);
  });

  test('muda o status pelo menu e a API guarda', async ({ page, api, signIn }) => {
    await signIn();
    const project = api.seed({ title: 'Meu fluxo' });
    await page.goto('/');
    const select = page.getByLabel('Status de Meu fluxo');
    await expect(select).toHaveValue('draft');
    await select.selectOption('done');

    await expect(select).toHaveValue('done');
    expect(api.callsTo('PATCH', `/projects/${project.id}`).map((call) => call.body)).toEqual([
      { status: 'done' },
    ]);
    expect(api.projects.get(project.id)?.status).toBe('done');
  });

  test('apagar pede confirmação, e cancelar não apaga', async ({ page, api, signIn }) => {
    await signIn();
    const project = api.seed({ title: 'Para apagar' });
    await page.goto('/');
    await page.getByRole('button', { name: 'Apagar Para apagar' }).click();
    const confirm = page.getByRole('group', { name: 'Apagar Para apagar' });
    await expect(confirm).toContainText('não dá para desfazer');
    await confirm.getByRole('button', { name: 'Cancelar' }).click();

    await expect(page.getByRole('link', { name: 'Para apagar' })).toBeVisible();
    expect(api.callsTo('DELETE', `/projects/${project.id}`)).toHaveLength(0);
  });

  test('confirmar apaga o projeto e a lista fica vazia', async ({ page, api, signIn }) => {
    await signIn();
    const project = api.seed({ title: 'Para apagar' });
    await page.goto('/');
    await page.getByRole('button', { name: 'Apagar Para apagar' }).click();
    await page
      .getByRole('group', { name: 'Apagar Para apagar' })
      .getByRole('button', { name: 'Apagar', exact: true })
      .click();

    await expect(page.getByText('Nenhum projeto ainda')).toBeVisible();
    expect(api.callsTo('DELETE', `/projects/${project.id}`)).toHaveLength(1);
    expect(api.projects.has(project.id)).toBe(false);
  });

  test('erro ao carregar a lista tem "Tentar de novo"', async ({ page, api, signIn }) => {
    await signIn();
    api.seed({ title: 'Voltou' });
    api.failNext('GET /projects', 503, 'Servidor indisponível.');
    await page.goto('/');
    await expect(page.getByRole('alert')).toContainText('Servidor indisponível.');
    await page.getByRole('button', { name: 'Tentar de novo' }).click();
    await expect(page.getByRole('link', { name: 'Voltou' })).toBeVisible();
  });
});

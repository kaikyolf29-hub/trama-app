import { expect, test } from './support/fixtures';

/** Quinta, 12 de novembro de 2026, 17:00 em São Paulo: o relógio do navegador nos testes. */
const NOW = new Date('2026-11-12T17:00:00-03:00');

test.describe('Agenda', () => {
  test.beforeEach(async ({ page, signIn }) => {
    await page.clock.setFixedTime(NOW);
    await signIn();
  });

  test('mostra o mês, o dia de hoje e abre o quadro ao clicar no evento', async ({ page, api }) => {
    const project = api.seed({ title: 'Como editar 10x mais rápido' });
    api.seedEvent({
      type: 'created',
      occurredAt: '2026-11-12T14:32:00-03:00',
      title: project.title,
      projectId: project.id,
      projectKind: 'flow',
    });
    api.seedEvent({
      type: 'studied',
      occurredAt: '2026-11-12T15:20:00-03:00',
      title: 'Atalhos de corte',
      detail: 'Premiere Pro',
      projectKind: 'notebook',
    });
    api.seedEvent({
      type: 'note',
      occurredAt: '2026-11-05T09:00:00-03:00',
      title: 'Ideia do jogo',
    });

    await page.goto('/agenda');
    await expect(page.getByRole('heading', { level: 1, name: 'Agenda' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /Novembro/ })).toBeVisible();
    await expect(page.getByText('2 dias com algo feito')).toBeVisible();

    // Uma consulta só, do ano inteiro, com o token da pessoa.
    const [query] = api.callsTo('GET', '/events');
    expect(query?.authorization).toMatch(/^Bearer /);
    expect(api.callsTo('GET', '/events')).toHaveLength(1);

    // O painel abre no dia de hoje, com hora e ícone por tipo.
    const panel = page.getByRole('complementary', { name: /12 nov/i });
    await expect(panel.getByText('14:32')).toBeVisible();
    await expect(panel.getByText('Fluxo criado')).toBeVisible();
    await expect(panel.getByText('Atalhos de corte · Premiere Pro')).toBeVisible();

    // Clicar no evento do fluxo abre o quadro.
    await panel.getByRole('link', { name: /Fluxo criado/ }).click();
    await expect(page).toHaveURL(`/p/${project.id}`);
  });

  test('troca de visão e anda entre os períodos', async ({ page, api }) => {
    api.seedEvent({ type: 'note', occurredAt: '2026-11-11T10:00:00-03:00', title: 'Ontem' });
    await page.goto('/agenda');
    await expect(page.getByText('1 dia com algo feito')).toBeVisible();

    await page.getByRole('button', { name: 'Mês anterior' }).click();
    await expect(page.getByRole('heading', { level: 2, name: /Outubro/ })).toBeVisible();
    await expect(page.getByText('Nada registrado neste mês.')).toBeVisible();
    await page.getByRole('button', { name: 'Hoje', exact: true }).click();
    await expect(page.getByRole('heading', { level: 2, name: /Novembro/ })).toBeVisible();

    await page.getByRole('button', { name: 'Dia' }).click();
    await expect(
      page.getByRole('heading', { level: 2, name: /12 de novembro de 2026/ }),
    ).toBeVisible();
    await expect(page.getByText('Nada registrado neste dia.')).toBeVisible();
    await page.getByRole('button', { name: 'Dia anterior' }).click();
    await expect(page.getByText('Ontem')).toBeVisible();

    await page.getByRole('button', { name: 'Ano', exact: true }).click();
    await expect(page.getByRole('grid')).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Dias de 2026' })).toBeVisible();
    // Só uma consulta: andar dentro do ano não busca de novo.
    expect(api.callsTo('GET', '/events')).toHaveLength(1);
  });

  test('"Registrar algo" grava uma anotação no passado, na data e hora escolhidas', async ({
    page,
    api,
  }) => {
    await page.goto('/agenda');
    await page.getByRole('button', { name: /Registrar algo/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Registrar algo' });
    await dialog.getByLabel('O que aconteceu').fill('Gravei o episódio 10');
    await dialog.getByLabel('Dia', { exact: true }).fill('2026-11-10');
    await dialog.getByLabel('Hora').fill('18:45');
    await dialog.getByRole('button', { name: 'Registrar' }).click();

    await expect(dialog).toBeHidden();
    const [post] = api.callsTo('POST', '/events');
    expect(post?.body).toEqual({
      title: 'Gravei o episódio 10',
      occurredAt: '2026-11-10T21:45:00.000Z',
    });
    const panel = page.getByRole('complementary', { name: /10 nov/i });
    await expect(panel.getByText('Gravei o episódio 10')).toBeVisible();
    await expect(panel.getByText('18:45')).toBeVisible();

    // Apagar a anotação pede confirmação.
    await panel.getByRole('button', { name: /Apagar a anotação/ }).click();
    await panel.getByRole('button', { name: 'Apagar', exact: true }).click();
    await expect(panel.getByText('Nada registrado neste dia.')).toBeVisible();
    expect(api.events.size).toBe(0);
  });

  test('erro ao carregar tem "Tentar de novo"', async ({ page, api }) => {
    api.seedEvent({ type: 'note', occurredAt: '2026-11-12T10:00:00-03:00', title: 'Voltou' });
    api.failNext('GET /events', 500, 'Não deu para carregar a Agenda.');
    await page.goto('/agenda');
    await expect(page.getByRole('alert')).toContainText('Não deu para carregar a Agenda.');
    await page.getByRole('button', { name: 'Tentar de novo' }).click();
    await expect(
      page.getByRole('complementary', { name: /nov/i }).getByText('Voltou'),
    ).toBeVisible();
  });
});

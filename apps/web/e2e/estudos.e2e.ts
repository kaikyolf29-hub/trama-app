import { expect, test } from './support/fixtures';

/** Quinta, 12 de novembro de 2026, 17:00 em São Paulo: o relógio do navegador nos testes. */
const NOW = new Date('2026-11-12T17:00:00-03:00');

test.describe('Estudos', () => {
  test.beforeEach(async ({ page, signIn }) => {
    await page.clock.setFixedTime(NOW);
    await signIn();
  });

  test('mostra os cadernos, o resumo de cada um e a tabela de aulas (tela 6)', async ({
    page,
    api,
  }) => {
    const premiere = api.seedNotebook({ title: 'Premiere Pro', content: { color: 'blue' } });
    const english = api.seedNotebook({ title: 'Inglês', content: { color: 'green' } });
    api.seedLesson(premiere.id, {
      title: 'Atalhos de corte',
      status: 'done',
      studiedAt: '2026-11-12T14:32:00-03:00',
      reviewOn: '2026-11-19',
    });
    api.seedLesson(premiere.id, {
      title: 'Correção de cor básica',
      status: 'done',
      studiedAt: '2026-11-05T20:10:00-03:00',
      reviewOn: '2026-11-12',
    });
    api.seedLesson(english.id, {
      title: 'Phrasal verbs do dia a dia',
      status: 'studying',
      studiedAt: '2026-11-04T09:15:00-03:00',
      reviewOn: '2026-12-01',
    });

    await page.goto('/estudos');
    await expect(page.getByRole('heading', { level: 1, name: 'Estudos' })).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Resumo semanal por e-mail' })).toBeChecked();

    const main = page.getByRole('main');
    const card = main.getByRole('link', { name: /Premiere Pro/ });
    await expect(card).toContainText('2 aulas · 1 para revisar');
    await expect(main.getByRole('link', { name: /Inglês/ })).toContainText('1 aula · em dia');

    const row = (title: string) => page.getByRole('row', { name: new RegExp(title) });
    await expect(row('Atalhos de corte')).toContainText('Feito');
    await expect(row('Atalhos de corte')).toContainText('12 nov · 14:32');
    await expect(row('Atalhos de corte')).toContainText('19 nov');
    // Feito, mas o dia da revisão chegou: aparece "Revisar" e "Hoje".
    await expect(row('Correção de cor básica')).toContainText('Revisar');
    await expect(row('Correção de cor básica')).toContainText('Hoje');
    await expect(row('Phrasal verbs')).toContainText('Estudando');

    // Uma consulta de cadernos e uma de aulas, com o token da pessoa.
    expect(api.callsTo('GET', '/notebooks')).toHaveLength(1);
    expect(api.callsTo('GET', '/lessons')).toHaveLength(1);
  });

  test('as abas "Todas as aulas" e "Revisões" mostram o que importa', async ({ page, api }) => {
    const book = api.seedNotebook({ title: 'Programação' });
    api.seedLesson(book.id, { title: 'Variáveis', status: 'done', reviewOn: '2026-11-20' });
    api.seedLesson(book.id, { title: 'Funções', status: 'done', reviewOn: '2026-11-10' });
    api.seedLesson(book.id, { title: 'Laços', status: 'review' });

    await page.goto('/estudos');
    await page.getByRole('tab', { name: 'Todas as aulas' }).click();
    const all = page.getByRole('tabpanel', { name: 'Todas as aulas' });
    await expect(all.getByRole('row')).toHaveCount(4);

    await page.getByRole('tab', { name: /Revisões/ }).click();
    const reviews = page.getByRole('tabpanel', { name: 'Revisões' });
    await expect(reviews.getByRole('row')).toHaveCount(3);
    await expect(reviews.getByRole('row').nth(1)).toContainText('Funções');
    await expect(reviews.getByRole('row').nth(2)).toContainText('Laços');
  });

  test('cria um caderno, abre e adiciona uma aula', async ({ page, api }) => {
    await page.goto('/estudos');
    await expect(page.getByText(/ainda não tem cadernos/)).toBeVisible();
    await page.getByRole('button', { name: 'Novo caderno' }).click();
    const dialog = page.getByRole('dialog', { name: 'Novo caderno' });
    await dialog.getByLabel('Nome').fill('Edição de vídeo');
    await dialog.getByText('Verde').click();
    await dialog.getByLabel('Revisar depois de quantos dias').fill('3');
    await dialog.getByRole('button', { name: 'Criar caderno' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Edição de vídeo' })).toBeVisible();
    const [post] = api.callsTo('POST', '/notebooks');
    expect(post?.body).toEqual({
      title: 'Edição de vídeo',
      content: { description: '', color: 'green', reviewAfterDays: 3 },
    });
    await expect(page.getByRole('heading', { level: 1, name: 'Edição de vídeo' })).toBeVisible();
    await expect(page.getByText(/volta para revisão 3 dias depois/)).toBeVisible();

    await page.getByLabel('Nome da nova aula').fill('Ritmo e cortes');
    await page.getByRole('button', { name: 'Adicionar aula' }).click();
    await expect(page.getByRole('button', { name: /detalhes de Ritmo e cortes/ })).toBeVisible();
    expect([...api.lessons.values()].map((lesson) => lesson.title)).toEqual(['Ritmo e cortes']);
  });

  test('marcar como estudada e revisei gravam as datas e entram na Agenda', async ({
    page,
    api,
  }) => {
    const book = api.seedNotebook({ title: 'Inglês', content: { reviewAfterDays: 5 } });
    const lesson = api.seedLesson(book.id, { title: 'Past perfect' });

    await page.goto(`/estudos/${book.id}`);
    await page.getByRole('button', { name: 'Marcar como estudada: Past perfect' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'marcada como estudada' }),
    ).toContainText('Revisão em 17 nov');
    const studied = api.lessons.get(lesson.id);
    expect(studied).toMatchObject({ status: 'done', reviewOn: '2026-11-17' });
    expect(studied?.studiedAt).toBe('2026-11-12T20:00:00.000Z');
    await expect(page.getByText('12 nov · 17:00')).toBeVisible();

    await page.getByRole('button', { name: 'Revisei: Past perfect' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'revisada' })).toBeVisible();
    expect(api.lessons.get(lesson.id)?.reviewedAt).toBe('2026-11-12T20:00:00.000Z');

    // A Agenda recebe os dois eventos, e o clique leva de volta ao caderno.
    await page.getByRole('link', { name: 'Agenda' }).click();
    const panel = page.getByRole('complementary', { name: /12 nov/i });
    await expect(panel.getByText('Aula estudada')).toBeVisible();
    await expect(panel.getByText('Aula revisada')).toBeVisible();
    await panel.getByRole('link', { name: /Aula estudada/ }).click();
    await expect(page).toHaveURL(`/estudos/${book.id}`);
  });

  test('notas, ordem e apagar uma aula', async ({ page, api }) => {
    const book = api.seedNotebook({ title: 'Premiere Pro' });
    api.seedLesson(book.id, { title: 'Primeira', position: 0 });
    api.seedLesson(book.id, { title: 'Segunda', position: 1 });

    await page.goto(`/estudos/${book.id}`);
    const titles = () =>
      page.getByRole('list', { name: 'Aulas' }).getByRole('button', { name: /detalhes de/ });

    await page.getByRole('button', { name: 'Subir "Segunda"' }).click();
    await expect(titles().first()).toHaveAccessibleName(/Segunda/);
    expect([...api.lessons.values()].find((l) => l.title === 'Segunda')?.position).toBe(0);

    await page.getByRole('button', { name: /detalhes de Primeira/ }).click();
    await page.getByLabel('Notas da aula').fill('Usar o atalho C para cortar.');
    await page.getByLabel('Nome da aula').click();
    await expect
      .poll(() => [...api.lessons.values()].find((l) => l.title === 'Primeira')?.notes)
      .toBe('Usar o atalho C para cortar.');

    await page.getByRole('button', { name: 'Apagar a aula "Primeira"' }).click();
    await page
      .getByRole('group', { name: 'Apagar Primeira' })
      .getByRole('button', { name: 'Apagar' })
      .click();
    await expect(page.getByRole('button', { name: /detalhes de Primeira/ })).toHaveCount(0);
    expect(api.lessons.size).toBe(1);
  });

  test('edita e apaga o caderno, com confirmação', async ({ page, api }) => {
    const book = api.seedNotebook({ title: 'Antigo' });
    api.seedLesson(book.id, { title: 'Uma aula' });
    await page.goto(`/estudos/${book.id}`);

    await page.getByRole('button', { name: 'Editar caderno' }).click();
    const dialog = page.getByRole('dialog', { name: 'Editar caderno' });
    await dialog.getByLabel('Nome').fill('Novo nome');
    await dialog.getByLabel('Descrição (opcional)').fill('Tudo sobre cortes');
    await dialog.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Novo nome' })).toBeVisible();
    await expect(page.getByText('Tudo sobre cortes')).toBeVisible();

    await page.getByRole('button', { name: 'Apagar caderno' }).click();
    await expect(page.getByText(/A aula dele some junto/)).toBeVisible();
    await page
      .getByRole('group', { name: /Apagar Novo nome/ })
      .getByRole('button', { name: 'Apagar caderno' })
      .click();
    await expect(page).toHaveURL('/estudos');
    expect(api.notebooks.size).toBe(0);
    expect(api.lessons.size).toBe(0);
  });

  test('o resumo semanal liga e desliga no perfil', async ({ page, api }) => {
    await page.goto('/estudos');
    const toggle = page.getByRole('switch', { name: 'Resumo semanal por e-mail' });
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    expect(api.profile.emailPreferences.weeklySummary).toBe(false);
  });

  test('o item da barra lateral leva a Estudos e lista os cadernos', async ({ page, api }) => {
    const book = api.seedNotebook({ title: 'Inglês' });
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'Principal' })
      .getByRole('link', { name: 'Estudos' })
      .click();
    await expect(page).toHaveURL('/estudos');
    const side = page.getByRole('navigation', { name: 'Cadernos' });
    await side.getByRole('link', { name: 'Inglês' }).click();
    await expect(page).toHaveURL(`/estudos/${book.id}`);
  });

  test('as datas seguem o fuso do perfil', async ({ page, api }) => {
    api.profile = { ...api.profile, timezone: 'UTC' };
    const book = api.seedNotebook({ title: 'Inglês' });
    api.seedLesson(book.id, {
      title: 'Aula UTC',
      status: 'done',
      studiedAt: '2026-11-12T17:32:00.000Z',
      reviewOn: '2026-11-19',
    });
    await page.goto('/estudos');
    // Em São Paulo seriam 14:32; no fuso do perfil (UTC), 17:32.
    await expect(page.getByRole('row', { name: /Aula UTC/ })).toContainText('12 nov · 17:32');

    // Às 22:30 de São Paulo já é dia 13 em UTC: o evento sai do painel de hoje (dia 12).
    api.seedEvent({
      type: 'note',
      occurredAt: '2026-11-13T01:30:00.000Z',
      title: 'Quase meia-noite',
    });
    await page.goto('/agenda');
    await expect(page.getByText('Nada registrado neste dia.')).toBeVisible();
  });

  test('no celular nada passa da largura da tela', async ({ page, api }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const book = api.seedNotebook({ title: 'Um caderno com um nome bem comprido para testar' });
    api.seedLesson(book.id, {
      title: 'Uma aula com um nome bem comprido para testar a quebra de linha',
      status: 'done',
      studiedAt: '2026-11-12T14:32:00-03:00',
      reviewOn: '2026-11-19',
    });
    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
    for (const path of ['/estudos', `/estudos/${book.id}`]) {
      await page.goto(path);
      await expect(page.getByRole('main')).toBeVisible();
      await expect(page.getByText('Carregando…')).toHaveCount(0);
      expect(await overflow(), path).toBeLessThanOrEqual(0);
    }
  });

  test('sem caderno aberto: caderno que não existe avisa', async ({ page }) => {
    await page.goto('/estudos/99999999-9999-4999-8999-999999999999');
    await expect(page.getByText(/Não achei este caderno/)).toBeVisible();
    await page.getByRole('link', { name: 'Voltar para Estudos' }).click();
    await expect(page).toHaveURL('/estudos');
  });
});

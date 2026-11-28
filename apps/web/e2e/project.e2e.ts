import type { Page } from '@playwright/test';
import { flowContentSchema } from '@trama/core';
import { board } from './support/board';
import { expect, test } from './support/fixtures';

/** Um fluxo pequeno: uma nota e um cartão, ligados por uma seta. */
const content = flowContentSchema.parse({
  schemaVersion: 1,
  blocks: [
    {
      id: 'nota',
      type: 'sticky',
      position: { x: 0, y: 0 },
      size: { width: 200, height: 120 },
      text: 'Primeira ideia',
      color: 'yellow',
    },
    {
      id: 'cartao',
      type: 'card',
      position: { x: 360, y: 0 },
      size: { width: 280, height: 144 },
      title: 'Gravar a aula',
    },
  ],
  arrows: [{ id: 'seta', from: { nodeId: 'nota' }, to: { nodeId: 'cartao' } }],
});

// A revisão de partida não é 1 de propósito: o PUT tem de levar a revisão que a API deu.
const REVISION = 3;

const saveStatus = (page: Page) => page.getByRole('status');

test.describe('projeto aberto no quadro (/p/<id>)', () => {
  test('abre o projeto com o título, os blocos e "Salvo"', async ({ page, api, signIn }) => {
    await signIn();
    const project = api.seed({ title: 'Minha aula', revision: REVISION, content });
    await page.goto(`/p/${project.id}`);

    await board.ready(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Minha aula');
    await expect(board.nodes(page)).toHaveCount(2);
    await expect(board.edges(page)).toHaveCount(1);
    await expect(saveStatus(page)).toContainText('Salvo');
    // Só abrir não grava nada.
    expect(api.callsTo('GET', `/projects/${project.id}`)).toHaveLength(1);
    expect(api.saves).toHaveLength(0);
  });

  test('uma mudança vira "Alterações não salvas", depois "Salvo", com o PUT na revisão certa', async ({
    page,
    api,
    signIn,
  }) => {
    await signIn();
    const project = api.seed({ title: 'Minha aula', revision: REVISION, content });
    await page.goto(`/p/${project.id}`);
    await board.ready(page);

    await board.node(page, 'nota').dblclick();
    await page.getByLabel('Texto da nota').fill('Ideia mudada');
    await page.mouse.click(900, 700);
    await expect(board.node(page, 'nota')).toContainText('Ideia mudada');

    // O salvamento espera 2 s sem mudanças.
    await expect(saveStatus(page)).toContainText('Alterações não salvas');
    await expect(saveStatus(page)).toContainText('Salvo');

    expect(api.saves).toHaveLength(1);
    const request = api.lastSave(project.id);
    expect(request?.baseRevision).toBe(REVISION);
    const note = request?.content.blocks.find((block) => block.id === 'nota');
    expect(note).toMatchObject({ type: 'sticky', text: 'Ideia mudada' });
    expect(api.projects.get(project.id)?.revision).toBe(REVISION + 1);
    expect(api.callsTo('PUT', `/projects/${project.id}`)[0]?.authorization).toMatch(/^Bearer /);
  });

  test('a segunda mudança usa a revisão devolvida pela primeira gravação', async ({
    page,
    api,
    signIn,
  }) => {
    await signIn();
    const project = api.seed({ title: 'Minha aula', revision: REVISION, content });
    await page.goto(`/p/${project.id}`);
    await board.ready(page);

    await board.node(page, 'nota').click();
    await page.keyboard.press('Delete');
    await expect.poll(() => api.saves.length).toBe(1);
    await expect(saveStatus(page)).toContainText('Salvo');

    await board.node(page, 'cartao').click();
    await page.keyboard.press('Delete');
    await expect.poll(() => api.saves.length).toBe(2);

    expect(api.saves.map((save) => save.request.baseRevision)).toEqual([REVISION, REVISION + 1]);
    expect(api.lastSave(project.id)?.content.blocks).toHaveLength(0);
  });

  test('recarregar a página mostra a mudança que foi salva', async ({ page, api, signIn }) => {
    await signIn();
    const project = api.seed({ title: 'Minha aula', revision: REVISION, content });
    await page.goto(`/p/${project.id}`);
    await board.ready(page);

    await board.node(page, 'cartao').dblclick();
    await page.getByLabel('Título do cartão').fill('Gravar e editar a aula');
    await page.keyboard.press('Enter');
    await expect.poll(() => api.saves.length).toBe(1);
    await expect(saveStatus(page)).toContainText('Salvo');

    await page.reload();
    await board.ready(page);
    await expect(board.node(page, 'cartao')).toContainText('Gravar e editar a aula');
    await expect(board.node(page, 'nota')).toContainText('Primeira ideia');
    await expect(board.edges(page)).toHaveCount(1);
  });

  test('uma nota nova criada pela tecla N também é salva', async ({ page, api, signIn }) => {
    await signIn();
    const project = api.seed({ title: 'Minha aula', revision: REVISION, content });
    await page.goto(`/p/${project.id}`);
    await board.ready(page);

    await page.keyboard.press('n');
    await page.mouse.click(1000, 700);
    await page.getByLabel('Texto da nota').fill('Nota criada no quadro');
    await page.getByLabel('Texto da nota').press('Escape');
    await expect.poll(() => api.saves.length).toBe(1);

    const blocks = api.lastSave(project.id)?.content.blocks ?? [];
    expect(blocks).toHaveLength(3);
    expect(blocks.at(-1)).toMatchObject({ type: 'sticky', text: 'Nota criada no quadro' });
  });

  test('se o PUT falha, mostra "Não salvou" e tenta de novo até salvar', async ({
    page,
    api,
    signIn,
  }) => {
    await signIn();
    const project = api.seed({ title: 'Minha aula', revision: REVISION, content });
    await page.goto(`/p/${project.id}`);
    await board.ready(page);

    api.failNext(`PUT /projects/${project.id}`, 503, 'Servidor ocupado.');
    await board.node(page, 'nota').click();
    await page.keyboard.press('Delete');

    await expect(saveStatus(page)).toContainText('Não salvou');
    await expect(saveStatus(page)).toContainText('Salvo', { timeout: 15_000 });
    // As duas tentativas levam a mesma revisão: a primeira não foi aceita.
    const puts = api.callsTo('PUT', `/projects/${project.id}`);
    expect(puts).toHaveLength(2);
    expect(api.saves).toHaveLength(1);
    expect(api.saves[0]?.request.baseRevision).toBe(REVISION);
  });

  test('projeto que não existe mostra o erro e o caminho de volta', async ({ page, signIn }) => {
    await signIn();
    await page.goto('/p/00000000-0000-4000-8000-000000000000');
    await expect(page.getByRole('alert')).toContainText('Projeto não encontrado');
    await page.getByRole('link', { name: 'Voltar para o início' }).click();
    await expect(page).toHaveURL('/');
  });

  test('o logo do quadro volta para o Início, e o projeto aparece na lista', async ({
    page,
    api,
    signIn,
  }) => {
    await signIn();
    const project = api.seed({ title: 'Minha aula', revision: REVISION, content });
    await page.goto(`/p/${project.id}`);
    await board.ready(page);
    await page.getByRole('link', { name: 'Trama, página inicial' }).click();

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('link', { name: 'Minha aula' })).toBeVisible();
  });
});

import type { Page } from '@playwright/test';
import { createScene } from '@trama/core';
import { expect, test } from './support/fixtures';

const editor = (page: Page) => page.getByRole('textbox', { name: 'Texto do roteiro' });
const panel = (page: Page) => page.getByRole('complementary', { name: 'Cenas no fluxo' });
const saved = (page: Page) => page.getByRole('status').filter({ hasText: 'Salvo' });

test.describe('roteiro (/p/<id> de um projeto script)', () => {
  test('cria o roteiro pelo modelo, escreve uma cena, vê "Salvo", cria no quadro e vê o cartão', async ({
    page,
    api,
    signIn,
  }) => {
    await signIn();
    const flow = api.seed({ title: 'Thumbnail do vídeo 12' });
    await page.goto('/');

    // Criar: um clique no modelo "Roteiro de vídeo" abre o editor com as cenas de exemplo.
    await page.getByRole('button', { name: /Roteiro de vídeo/ }).click();
    await expect(page).toHaveURL(/\/p\/[0-9a-f-]{36}$/);
    await expect(editor(page)).toContainText('Gancho');
    await expect(saved(page)).toBeVisible();
    const [script] = [...api.projects.values()].filter((project) => project.kind === 'script');
    if (script?.kind !== 'script') throw new Error('o modelo não criou um roteiro');
    expect(script.content.scenes.length).toBeGreaterThanOrEqual(3);
    const before = script.content.scenes.length;

    // Escrever uma cena nova: título, tempo (Tab), nota, fala (menu "/") e B-roll.
    await panel(page)
      .getByRole('button', { name: /próxima cena/ })
      .click();
    await expect(editor(page)).toBeFocused();
    await page.keyboard.type('Mostrar o problema');
    await page.keyboard.press('Tab');
    await page.keyboard.type('0:15–1:00');
    await expect(page.getByRole('textbox', { name: 'Tempo da cena' }).last()).toHaveValue(
      '0:15–1:00',
    );
    // Tab no tempo leva ao texto da cena: a nota vem primeiro.
    await page.keyboard.press('Tab');
    await expect(editor(page)).toBeFocused();
    await page.keyboard.type('Plano aberto da timeline bagunçada');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/fala');
    await expect(page.getByRole('listbox', { name: 'Blocos de roteiro' })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listbox', { name: 'Blocos de roteiro' })).toBeHidden();
    await page.keyboard.type('Olha como está essa timeline.');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/plano');
    await expect(page.getByRole('listbox', { name: 'Blocos de roteiro' })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listbox', { name: 'Blocos de roteiro' })).toBeHidden();
    await page.keyboard.type('Zoom nos trechos mortos');

    // O salvamento sozinho espera 2 s e depois mostra "Salvo".
    await expect(
      page.getByRole('status').filter({ hasText: 'Alterações não salvas' }),
    ).toBeVisible();
    await expect(saved(page)).toBeVisible({ timeout: 10_000 });
    const request = api.lastScriptSave(script.id);
    expect(request?.baseRevision).toBeGreaterThan(0);
    const scenes = request?.content.scenes ?? [];
    expect(scenes).toHaveLength(before + 1);
    expect(scenes.at(-1)).toMatchObject({
      title: 'Mostrar o problema',
      time: '0:15–1:00',
      notes: 'Plano aberto da timeline bagunçada',
      narration: 'Olha como está essa timeline.',
      broll: ['Zoom nos trechos mortos'],
    });
    await expect(panel(page).getByRole('button', { name: /Mostrar o problema/ })).toBeVisible();

    // Fluxo vinculado: escolhe o fluxo da pessoa e cria os cartões no quadro dele.
    await page
      .getByRole('combobox', { name: 'Fluxo vinculado' })
      .selectOption({ label: flow.title });
    await panel(page).getByRole('button', { name: 'Criar no quadro' }).click();
    await expect(panel(page).getByRole('status')).toContainText(
      `${before + 1} cartões criados no quadro.`,
    );
    const cards = api.flow(flow.id).content.blocks.filter((block) => block.type === 'card');
    expect(cards.map((card) => card.title)).toContain('Mostrar o problema');
    expect(cards).toHaveLength(before + 1);
    // A gravação do quadro levou a revisão que a API tinha (1), e não sobrescreveu ninguém.
    expect(api.saves.find((save) => save.id === flow.id)?.request.baseRevision).toBe(1);
    await expect(panel(page).getByText('No quadro', { exact: true })).toHaveCount(before + 1);
    await expect(saved(page)).toBeVisible({ timeout: 10_000 });
    expect(
      api.lastScriptSave(script.id)?.content.scenes.every((scene) => scene.cardId !== undefined),
    ).toBe(true);

    // O cartão aparece no quadro do fluxo.
    await page.getByRole('link', { name: 'Abrir o quadro' }).click();
    await expect(page).toHaveURL(`/p/${flow.id}`);
    await expect(page.locator('.react-flow__node')).toHaveCount(before + 1);
    await expect(
      page.locator('.react-flow__node', { hasText: 'Mostrar o problema' }),
    ).toBeVisible();
  });

  test('"Trazer do quadro" e as duas atualizações levam as mudanças de um lado para o outro', async ({
    page,
    api,
    signIn,
  }) => {
    await signIn();
    const flow = api.seed({ title: 'Quadro da aula' });
    const script = api.seedScript({
      title: 'Roteiro da aula',
      content: {
        schemaVersion: 1,
        flowId: flow.id,
        targetDuration: '',
        scenes: [createScene({ id: 'a', title: 'Abertura', narration: 'Bem-vindos' })],
      },
    });
    await page.goto(`/p/${script.id}`);
    await expect(editor(page)).toContainText('Abertura');

    await panel(page).getByRole('button', { name: 'Criar no quadro' }).click();
    await expect(panel(page).getByRole('status')).toContainText('1 cartão criado no quadro.');

    // Muda o cartão no "quadro" (a API) e puxa para o roteiro.
    const card = api.flow(flow.id).content.blocks.find((block) => block.type === 'card');
    if (card?.type !== 'card') throw new Error('cartão não criado');
    api.projects.set(flow.id, {
      ...api.flow(flow.id),
      revision: 7,
      content: {
        ...api.flow(flow.id).content,
        blocks: [
          { ...card, title: 'Abertura (do quadro)', description: 'Fala vinda do quadro' },
          { ...card, id: 'cartao-novo', title: 'Cartão novo', description: undefined },
        ],
      },
    });
    await panel(page).getByRole('button', { name: 'Atualizar do quadro' }).click();
    await expect(panel(page).getByRole('status')).toContainText('1 cena atualizada');
    await expect(editor(page)).toContainText('Abertura (do quadro)');
    await expect(editor(page)).toContainText('Fala vinda do quadro');

    await panel(page).getByRole('button', { name: 'Trazer do quadro' }).click();
    await expect(panel(page).getByRole('status')).toContainText('1 cartão trazido do quadro');
    await expect(editor(page)).toContainText('Cartão novo');

    // Muda a fala da cena e manda para o quadro, com a revisão que a API tem agora (7).
    await editor(page).getByText('Fala vinda do quadro').click();
    await page.keyboard.type(' e mais um pouco');
    await panel(page).getByRole('button', { name: 'Atualizar o quadro' }).click();
    await expect(panel(page).getByRole('status')).toContainText('atualizados no quadro');
    expect(api.saves.at(-1)?.request.baseRevision).toBe(7);
    const updated = api.flow(flow.id).content.blocks.find((block) => block.id === card.id);
    expect(updated).toMatchObject({ description: expect.stringContaining('e mais um pouco') });
  });

  test('Tab anda entre os campos e Ctrl+Z desfaz o que foi digitado', async ({
    page,
    api,
    signIn,
  }) => {
    await signIn();
    const script = api.seedScript({
      content: {
        schemaVersion: 1,
        flowId: null,
        targetDuration: '',
        scenes: [createScene({ id: 'a', title: 'Gancho', time: '0:00' })],
      },
    });
    await page.goto(`/p/${script.id}`);
    await editor(page).getByText('Gancho').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' forte');
    await expect(editor(page)).toContainText('Gancho forte');
    await page.keyboard.press('Control+z');
    await expect(editor(page)).not.toContainText('forte');

    // Do título, o Tab vai para o tempo da cena; do tempo, para o texto; Shift+Tab volta.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('textbox', { name: 'Tempo da cena' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(editor(page)).toBeFocused();
    await page.keyboard.type('Nota da cena');
    await expect(editor(page)).toContainText('Nota da cena');
    await page.getByRole('textbox', { name: 'Tempo da cena' }).focus();
    await page.keyboard.press('Shift+Tab');
    await expect(editor(page)).toBeFocused();
    await page.keyboard.type('!');
    await expect(editor(page)).toContainText('Gancho!');
  });

  test('sem fluxo ligado, "Criar no quadro" cria um fluxo novo e liga o roteiro', async ({
    page,
    api,
    signIn,
  }) => {
    await signIn();
    const script = api.seedScript({
      title: 'Episódio 3',
      content: {
        schemaVersion: 1,
        flowId: null,
        targetDuration: '',
        scenes: [createScene({ id: 'a', title: 'Gancho' }), createScene({ id: 'b', title: 'Fim' })],
      },
    });
    await page.goto(`/p/${script.id}`);
    await expect(panel(page).getByRole('button', { name: 'Atualizar o quadro' })).toBeDisabled();
    await page.getByRole('button', { name: 'Criar no quadro' }).first().click();
    await expect(panel(page).getByRole('status')).toContainText('2 cartões criados no quadro.');
    const created = [...api.projects.values()].find((project) => project.kind === 'flow');
    expect(created?.title).toBe('Episódio 3');
    await expect(saved(page)).toBeVisible({ timeout: 10_000 });
    expect(api.script(script.id).content.flowId).toBe(created?.id);
  });
});

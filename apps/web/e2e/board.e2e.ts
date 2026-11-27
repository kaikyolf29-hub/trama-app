import { board } from './support/board';
import { expect, test } from './support/fixtures';

// O fluxo de exemplo da tela 1 (/exemplo): 2 molduras e 13 blocos, 4 setas. Sem login e sem
// salvar: serve para testar o quadro sozinho. Com a câmera ajustada em 1440 x 900, este ponto
// está vazio (à direita da moldura "Vídeo", abaixo das ideias).
const EMPTY_SPOT = { x: 1150, y: 600 };
const NODES = 15;
const EDGES = 4;

test.describe('quadro de exemplo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/exemplo');
    await board.ready(page);
    await expect(board.nodes(page)).toHaveCount(NODES);
    await expect(board.edges(page)).toHaveCount(EDGES);
  });

  test('a tecla N e um clique criam uma nota já em edição', async ({ page }) => {
    await page.keyboard.press('n');
    await expect(page.getByRole('button', { name: 'Nota adesiva' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.mouse.click(EMPTY_SPOT.x, EMPTY_SPOT.y);

    await expect(board.nodes(page)).toHaveCount(NODES + 1);
    const field = page.getByLabel('Texto da nota');
    await expect(field).toBeFocused();
    await field.fill('Ideia nova');
    await field.press('Escape');

    await expect(page.getByLabel('Texto da nota')).toHaveCount(0);
    await expect(page.getByText('Ideia nova')).toBeVisible();
    // Voltou para a ferramenta de seleção.
    await expect(page.getByRole('button', { name: 'Selecionar' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('clique duplo no bloco edita o texto', async ({ page }) => {
    const note = board.node(page, 'ideia-erros');
    await expect(note).toContainText('Erros que todo iniciante comete');
    await note.dblclick();
    const field = page.getByLabel('Texto da nota');
    await expect(field).toBeFocused();
    await field.fill('Erros de edição');
    await page.mouse.click(EMPTY_SPOT.x, EMPTY_SPOT.y);

    await expect(note).toContainText('Erros de edição');
    await expect(note).not.toContainText('iniciante');
  });

  test('clique duplo no vazio cria um texto', async ({ page }) => {
    await page.mouse.dblclick(EMPTY_SPOT.x, EMPTY_SPOT.y);
    await expect(board.nodes(page)).toHaveCount(NODES + 1);
    await expect(page.getByRole('textbox', { name: 'Texto', exact: true })).toBeFocused();
  });

  test('o ponto azul puxa uma seta para outro bloco', async ({ page }) => {
    await board.connect(
      page,
      { id: 'nota-comentario', side: 'bottom' },
      { id: 'ideia-setup', side: 'left' },
    );
    await expect(board.edges(page)).toHaveCount(EDGES + 1);
  });

  test('Ctrl+Z desfaz a seta e Ctrl+Shift+Z refaz', async ({ page }) => {
    await board.connect(
      page,
      { id: 'nota-comentario', side: 'bottom' },
      { id: 'ideia-setup', side: 'left' },
    );
    await expect(board.edges(page)).toHaveCount(EDGES + 1);

    await page.keyboard.press('Control+z');
    await expect(board.edges(page)).toHaveCount(EDGES);
    await page.keyboard.press('Control+Shift+z');
    await expect(board.edges(page)).toHaveCount(EDGES + 1);
  });

  test('Ctrl+Z desfaz uma nota criada', async ({ page }) => {
    await page.keyboard.press('n');
    await page.mouse.click(EMPTY_SPOT.x, EMPTY_SPOT.y);
    await page.getByLabel('Texto da nota').press('Escape');
    await expect(board.nodes(page)).toHaveCount(NODES + 1);

    await page.keyboard.press('Control+z');
    await expect(board.nodes(page)).toHaveCount(NODES);
  });

  test('Delete apaga o bloco selecionado e as setas que chegavam nele', async ({ page }) => {
    // O cartão "Projeto" tem duas setas (para a imagem e para o vídeo).
    await board.node(page, 'card-projeto').click({ position: { x: 150, y: 20 } });
    await expect(board.contextBar(page)).toBeVisible();
    await page.keyboard.press('Delete');

    await expect(board.node(page, 'card-projeto')).toHaveCount(0);
    await expect(board.nodes(page)).toHaveCount(NODES - 1);
    await expect(board.edges(page)).toHaveCount(EDGES - 2);

    await page.keyboard.press('Control+z');
    await expect(board.node(page, 'card-projeto')).toHaveCount(1);
    await expect(board.edges(page)).toHaveCount(EDGES);
  });

  test('a barra de contexto muda a cor da nota e apaga pelo botão', async ({ page }) => {
    const note = board.node(page, 'ideia-erros');
    await note.click();
    const bar = board.contextBar(page);
    await expect(bar).toBeVisible();

    const background = () =>
      note
        .locator('[style*="background-color"]')
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor);
    const before = await background();
    await bar.getByRole('button', { name: /Cor da nota/ }).click();
    await bar.getByRole('radio', { name: 'Rosa' }).click();
    await expect.poll(background).not.toBe(before);

    await bar.getByRole('button', { name: 'Apagar' }).click();
    await expect(board.node(page, 'ideia-erros')).toHaveCount(0);
    await expect(board.nodes(page)).toHaveCount(NODES - 1);
  });

  test('clique direito no vazio abre o menu de criar', async ({ page }) => {
    await page.mouse.click(EMPTY_SPOT.x, EMPTY_SPOT.y, { button: 'right' });
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem')).toHaveText([
      /Texto/,
      /Cartão/,
      /Nota adesiva/,
      /Forma/,
      /Etapas/,
      /Moldura/,
    ]);
    await menu.getByRole('menuitem', { name: /Cartão/ }).click();

    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(board.nodes(page)).toHaveCount(NODES + 1);
  });

  test('clique direito num bloco duplica', async ({ page }) => {
    await board.node(page, 'ideia-setup').click({ button: 'right' });
    await page.getByRole('menuitem', { name: /Duplicar/ }).click();
    await expect(board.nodes(page)).toHaveCount(NODES + 1);
  });

  test('clique direito num bloco apaga', async ({ page }) => {
    await board.node(page, 'ideia-setup').click({ button: 'right' });
    await page.getByRole('menuitem', { name: /Apagar/ }).click();
    await expect(board.nodes(page)).toHaveCount(NODES - 1);
    await expect(board.node(page, 'ideia-setup')).toHaveCount(0);
  });

  test('Esc fecha o menu', async ({ page }) => {
    await page.mouse.click(EMPTY_SPOT.x, EMPTY_SPOT.y, { button: 'right' });
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
  });

  test('os botões de zoom mudam a porcentagem e Ajustar volta', async ({ page }) => {
    const label = page.getByText(/^\d+%$/);
    // A câmera começa ajustada ao fluxo, e o ajuste para em 100% (FIT_VIEW.maxZoom).
    await expect(label).toHaveText('100%');
    await page.getByRole('button', { name: 'Aumentar zoom' }).click();
    await expect(label).not.toHaveText('100%');
    await page.getByRole('button', { name: 'Ajustar' }).click();
    await expect(label).toHaveText('100%');
  });
});

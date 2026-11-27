import { expect, type Locator, type Page } from '@playwright/test';

/** Ajudantes do quadro (React Flow): os nós e as setas desenhados e onde clicar. */
export const board = {
  /** Todos os nós (blocos e molduras). */
  nodes: (page: Page) => page.locator('.react-flow__node'),
  /** Um nó pelo id do bloco ou da moldura. */
  node: (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`),
  /** As setas desenhadas. */
  edges: (page: Page) => page.locator('.react-flow__edge'),
  /** A barra de contexto do nó selecionado. */
  contextBar: (page: Page) => page.getByRole('toolbar', { name: 'Opções do bloco' }),
  /** O ponto azul (conexão) de um lado do nó. */
  dot: (node: Locator, side: 'top' | 'right' | 'bottom' | 'left') =>
    node.locator(`.react-flow__handle[data-handleid="${side}"]`),
  /** Espera o quadro abrir com ao menos um nó desenhado. */
  async ready(page: Page) {
    await expect(page.getByTestId('quadro')).toBeVisible();
    await expect(board.nodes(page).first()).toBeVisible();
  },
  /** O ponto do meio de um elemento na tela. */
  async center(locator: Locator) {
    const box = await locator.boundingBox();
    if (!box) throw new Error('elemento fora da tela');
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  },
  /** Arrasta com o mouse de um ponto a outro, em passos (o React Flow precisa ver o caminho). */
  async drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 12) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps });
    await page.mouse.up();
  },
  /** Puxa uma seta do ponto azul de um nó até o ponto azul de outro. */
  async connect(
    page: Page,
    from: { id: string; side: 'top' | 'right' | 'bottom' | 'left' },
    to: { id: string; side: 'top' | 'right' | 'bottom' | 'left' },
  ) {
    const source = board.node(page, from.id);
    await source.click();
    const start = board.dot(source, from.side);
    await expect(start).toBeVisible();
    const end = board.dot(board.node(page, to.id), to.side);
    await board.drag(page, await board.center(start), await board.center(end));
  },
};

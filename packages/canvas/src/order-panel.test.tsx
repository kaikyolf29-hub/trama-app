import { cleanup, createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import { flowContentSchema, presentationStepNumber, type FlowContent } from '@trama/core';
import { videoFlowExample } from '@trama/core/fixtures';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FlowCanvas } from './FlowCanvas';
import { OrderPanel } from './order-panel';

const flow = flowContentSchema.parse(videoFlowExample);

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  globalThis.DOMMatrixReadOnly ??= class {
    m22 = 1;
  } as unknown as typeof DOMMatrixReadOnly;
});

afterEach(cleanup);

const ids = (steps: readonly { id: string }[]) => steps.map((step) => step.id);

describe('painel "Ordem da apresentação"', () => {
  function setup(selectedIds: string[] = [], content: FlowContent = flow) {
    const onChange = vi.fn();
    const onShow = vi.fn();
    const onClose = vi.fn();
    render(
      <OrderPanel
        flow={content}
        selectedIds={selectedIds}
        onChange={onChange}
        onShow={onShow}
        onClose={onClose}
      />,
    );
    const last = () => {
      const call = onChange.mock.calls.at(-1);
      if (!call) throw new Error('O painel ainda não avisou nenhuma mudança.');
      return call[0] as FlowContent['presentation'];
    };
    return { onChange, onShow, onClose, last };
  }
  const rows = () => within(screen.getByRole('list')).getAllByRole('listitem');

  it('lista os passos com o número e o nome (o título, ou o nome dos blocos)', () => {
    setup();
    expect(rows()).toHaveLength(4);
    expect(within(rows()[0]!).getByText('1')).toBeDefined();
    expect(within(rows()[0]!).getByText(/Como editar 10x mais rápido/)).toBeDefined();
    expect(within(rows()[3]!).getByText('Próximos vídeos')).toBeDefined();
    expect(within(rows()[1]!).getByText('3 itens')).toBeDefined();
    expect(within(rows()[3]!).getByText('1 item')).toBeDefined();
  });

  it('sem passos, explica o que fazer', () => {
    setup([], { ...flow, presentation: [] });
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByText(/Nenhum passo ainda/)).toBeDefined();
  });

  it('sobe e desce um passo, e os botões das pontas ficam desativados', () => {
    const { last } = setup();
    expect(screen.getByRole('button', { name: 'Subir o passo 1' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByRole('button', { name: 'Descer o passo 4' })).toHaveProperty(
      'disabled',
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Descer o passo 1' }));
    expect(ids(last())).toEqual(['passo-2', 'passo-1', 'passo-3', 'passo-4']);
    fireEvent.click(screen.getByRole('button', { name: 'Subir o passo 4' }));
    expect(ids(last())).toEqual(['passo-1', 'passo-2', 'passo-4', 'passo-3']);
  });

  it('arrastar um passo para cima de outro troca a ordem', () => {
    const { last } = setup();
    const [first, , , fourth] = rows();
    const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' };
    fireEvent.dragStart(fourth!, { dataTransfer });
    fireEvent.dragOver(first!, { dataTransfer });
    fireEvent.drop(first!, { dataTransfer });
    expect(ids(last())).toEqual(['passo-4', 'passo-1', 'passo-2', 'passo-3']);
  });

  it('largar um passo no mesmo lugar não muda nada', () => {
    const { onChange } = setup();
    const [first] = rows();
    const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' };
    fireEvent.dragStart(first!, { dataTransfer });
    const over = createEvent.dragOver(first!, { dataTransfer });
    fireEvent(first!, over);
    fireEvent.drop(first!, { dataTransfer });
    expect(ids((onChange.mock.calls.at(-1)?.[0] ?? []) as FlowContent['presentation'])).toEqual(
      ids(flow.presentation),
    );
  });

  it('renomeia: Enter confirma, e nome vazio volta ao nome dos blocos', () => {
    const { last } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Renomear o passo 1' }));
    const field = screen.getByRole('textbox', { name: 'Nome do passo 1' });
    fireEvent.change(field, { target: { value: 'Abertura' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(last()[0]?.title).toBe('Abertura');

    fireEvent.click(screen.getByRole('button', { name: 'Renomear o passo 4' }));
    const second = screen.getByRole('textbox', { name: 'Nome do passo 4' });
    expect((second as HTMLInputElement).value).toBe('Próximos vídeos');
    fireEvent.change(second, { target: { value: '' } });
    fireEvent.blur(second);
    expect(last()[3]).not.toHaveProperty('title');
  });

  it('Esc cancela o nome', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Renomear o passo 1' }));
    const field = screen.getByRole('textbox', { name: 'Nome do passo 1' });
    fireEvent.change(field, { target: { value: 'Outro' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('clique duplo no nome também renomeia', () => {
    setup();
    fireEvent.doubleClick(within(rows()[0]!).getByTitle('Mostrar no quadro'));
    expect(screen.getByRole('textbox', { name: 'Nome do passo 1' })).toBeDefined();
  });

  it('apaga o passo', () => {
    const { last } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Apagar o passo 2' }));
    expect(ids(last())).toEqual(['passo-1', 'passo-3', 'passo-4']);
  });

  it('clicar no nome mostra o passo no quadro', () => {
    const { onShow } = setup();
    fireEvent.click(within(rows()[2]!).getByTitle('Mostrar no quadro'));
    expect(onShow).toHaveBeenCalledWith(flow.presentation[2]);
  });

  it('"Adicionar a seleção como passo" só vale com algo selecionado', () => {
    const { last } = setup(['ideia-erros', 'etapas']);
    expect(screen.getByText(/2 itens selecionados/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar a seleção como passo' }));
    expect(last().at(-1)?.targetIds).toEqual(['ideia-erros', 'etapas']);
    cleanup();
    setup();
    expect(screen.getByRole('button', { name: 'Adicionar a seleção como passo' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('o botão de fechar avisa', () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('painel no quadro', () => {
  function board() {
    const onFlowChange = vi.fn<(next: FlowContent) => void>();
    render(<FlowCanvas flow={flow} onFlowChange={onFlowChange} />);
    const last = () => {
      const next = onFlowChange.mock.calls.at(-1)?.[0];
      if (!next) throw new Error('O quadro ainda não avisou nenhuma mudança.');
      return next;
    };
    return { onFlowChange, last };
  }

  it('abre e fecha pelo botão da barra de ferramentas', () => {
    board();
    const open = screen.getByRole('button', { name: 'Ordem da apresentação' });
    expect(open.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('region', { name: 'Ordem da apresentação' })).toBeNull();
    fireEvent.click(open);
    expect(open.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('region', { name: 'Ordem da apresentação' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('region', { name: 'Ordem da apresentação' })).toBeNull();
  });

  it('reordenar grava o fluxo com os passos na nova ordem, e Ctrl+Z desfaz', () => {
    const { last, onFlowChange } = board();
    fireEvent.click(screen.getByRole('button', { name: 'Ordem da apresentação' }));
    fireEvent.click(screen.getByRole('button', { name: 'Descer o passo 1' }));
    expect(ids(last().presentation)).toEqual(['passo-2', 'passo-1', 'passo-3', 'passo-4']);
    expect(() => flowContentSchema.parse(last())).not.toThrow();
    // A lista mostra a nova ordem.
    const panel = within(screen.getByRole('region', { name: 'Ordem da apresentação' }));
    expect(within(panel.getAllByRole('listitem')[1]!).getByText(/Como editar 10x/)).toBeDefined();

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(ids(last().presentation)).toEqual(['passo-1', 'passo-2', 'passo-3', 'passo-4']);
    expect(onFlowChange).toHaveBeenCalledTimes(2);
  });

  it('renomear e apagar passam pelo mesmo caminho', () => {
    const { last } = board();
    fireEvent.click(screen.getByRole('button', { name: 'Ordem da apresentação' }));
    fireEvent.click(screen.getByRole('button', { name: 'Renomear o passo 3' }));
    const field = screen.getByRole('textbox', { name: 'Nome do passo 3' });
    fireEvent.change(field, { target: { value: 'Etapas e nota' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(last().presentation[2]?.title).toBe('Etapas e nota');
    expect(screen.getByText('Etapas e nota')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Apagar o passo 1' }));
    expect(last().presentation).toHaveLength(3);
    expect(presentationStepNumber(last().presentation, 'card-projeto')).toBeUndefined();
    // Os blocos do passo apagado continuam no quadro.
    expect(last().blocks.some((block) => block.id === 'card-projeto')).toBe(true);
  });

  it('o nome do passo acompanha o texto do bloco editado', () => {
    board();
    fireEvent.click(screen.getByRole('button', { name: 'Ordem da apresentação' }));
    expect(screen.getAllByText(/Como editar 10x mais rápido/).length).toBeGreaterThan(0);
  });

  it('com a moldura selecionada (clique direito > passo), o painel mostra o passo novo', () => {
    // O "Adicionar a seleção" usa os nós selecionados do React Flow.
    const { last } = board();
    fireEvent.click(screen.getByRole('button', { name: 'Ordem da apresentação' }));
    expect(screen.getByRole('button', { name: 'Adicionar a seleção como passo' })).toHaveProperty(
      'disabled',
      true,
    );
    fireEvent.click(screen.getByText('Fixar comentário com o link do curso'));
    const add = screen.getByRole('button', { name: 'Adicionar a seleção como passo' });
    expect(add).toHaveProperty('disabled', false);
    fireEvent.click(add);
    // A nota estava no passo 3 junto com as etapas: sai de lá e vira o passo 5.
    expect(last().presentation).toHaveLength(5);
    expect(last().presentation[4]?.targetIds).toEqual(['nota-comentario']);
    expect(last().presentation[2]?.targetIds).toEqual(['etapas']);
  });
});

import { flowContentSchema, type FlowContent } from '@trama/core';
import { videoFlowExample } from '@trama/core/fixtures';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FlowCanvas } from './FlowCanvas';

const flow = flowContentSchema.parse(videoFlowExample);

// O jsdom não tem ResizeObserver nem DOMMatrixReadOnly, que o React Flow usa.
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

describe('FlowCanvas', () => {
  it('mostra as molduras com o nome e os blocos', () => {
    render(<FlowCanvas flow={flow} />);
    expect(screen.getByText('Vídeo · Como editar 10x mais rápido')).toBeDefined();
    expect(screen.getByText('Ideias · próximos vídeos')).toBeDefined();
    expect(screen.getByText('Fixar comentário com o link do curso')).toBeDefined();
    expect(document.querySelectorAll('.react-flow__node')).toHaveLength(15);
  });

  it('começa na ferramenta de selecionar e troca para mover o quadro', () => {
    render(<FlowCanvas flow={flow} />);
    const select = screen.getByRole('button', { name: 'Selecionar' });
    const pan = screen.getByRole('button', { name: 'Mover quadro' });
    expect(select.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(pan);
    expect(pan.getAttribute('aria-pressed')).toBe('true');
    expect(select.getAttribute('aria-pressed')).toBe('false');
  });

  it('mostra as ferramentas das próximas etapas, desativadas', () => {
    render(<FlowCanvas flow={flow} />);
    const toolbar = screen.getByRole('toolbar', { name: 'Ferramentas' });
    expect(toolbar).toBeDefined();
    expect(screen.getByRole('button', { name: 'Seta' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Nota adesiva' })).toHaveProperty('disabled', false);
    expect(screen.getByRole('button', { name: 'Organizar com IA' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('tem zoom com o botão Ajustar e o minimapa', () => {
    render(<FlowCanvas flow={flow} />);
    expect(screen.getByRole('button', { name: 'Aumentar zoom' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Diminuir zoom' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Ajustar' })).toBeDefined();
    expect(document.querySelector('.react-flow__minimap')).not.toBeNull();
  });

  it('mostra as barras do app que vierem de fora', () => {
    render(<FlowCanvas flow={flow} topLeft={<h1>Título do fluxo</h1>} />);
    expect(screen.getByRole('heading', { name: 'Título do fluxo' })).toBeDefined();
  });

  describe('criar e editar (etapa 1.2)', () => {
    function setup() {
      const onFlowChange = vi.fn<(next: FlowContent) => void>();
      render(<FlowCanvas flow={flow} onFlowChange={onFlowChange} />);
      const last = () => {
        const calls = onFlowChange.mock.calls;
        const next = calls[calls.length - 1]?.[0];
        if (!next) throw new Error('O quadro ainda não avisou nenhuma mudança.');
        return next;
      };
      return { onFlowChange, last };
    }
    const pane = () => {
      const element = document.querySelector('.react-flow__pane');
      if (!element) throw new Error('Sem o fundo do quadro.');
      return element;
    };
    // Com a seleção por arrasto ligada, o React Flow lê o clique no fundo pelo ponteiro.
    const clickPane = (clientX: number, clientY: number) => {
      const init = { button: 0, isPrimary: true, pointerId: 1, clientX, clientY };
      fireEvent.pointerDown(pane(), init);
      fireEvent.pointerUp(pane(), init);
    };

    it('a tecla N escolhe a nota adesiva e o clique cria a nota, já em edição', () => {
      const { last } = setup();
      fireEvent.keyDown(window, { key: 'n' });
      expect(
        screen.getByRole('button', { name: 'Nota adesiva' }).getAttribute('aria-pressed'),
      ).toBe('true');
      clickPane(400, 300);

      const created = last().blocks.at(-1);
      expect(created?.type).toBe('sticky');
      expect(last().blocks).toHaveLength(flow.blocks.length + 1);
      expect(() => flowContentSchema.parse(last())).not.toThrow();
      // Volta para selecionar, e o texto da nota abre para escrever.
      expect(screen.getByRole('button', { name: 'Selecionar' }).getAttribute('aria-pressed')).toBe(
        'true',
      );
      const field = screen.getByRole('textbox', { name: 'Texto da nota' });
      fireEvent.change(field, { target: { value: 'Gravar o teaser' } });
      fireEvent.blur(field);
      expect(last().blocks.at(-1)).toMatchObject({ type: 'sticky', text: 'Gravar o teaser' });
      expect(screen.getByText('Gravar o teaser')).toBeDefined();
    });

    it('as teclas T, C, R e F criam texto, cartão, forma e moldura', () => {
      const { last } = setup();
      const created: string[] = [];
      for (const key of ['t', 'c', 'r', 'f']) {
        fireEvent.keyDown(window, { key });
        clickPane(200, 200);
        // Sai da edição antes do próximo atalho, como a pessoa faria.
        const field = document.querySelector('textarea');
        if (field) fireEvent.blur(field);
        const next = last();
        created.push(
          key === 'f' ? `frame:${next.frames.at(-1)?.title}` : (next.blocks.at(-1)?.type ?? ''),
        );
      }
      expect(created).toEqual(['text', 'card', 'shape', 'frame:Nova seção']);
      expect(last().frames).toHaveLength(flow.frames.length + 1);
    });

    it('clique duplo num ponto vazio cria um texto', () => {
      const { last } = setup();
      fireEvent.doubleClick(pane(), { clientX: 300, clientY: 300 });
      expect(last().blocks.at(-1)?.type).toBe('text');
      expect(screen.getByRole('textbox', { name: 'Texto' })).toBeDefined();
    });

    it('clique duplo num bloco edita o texto; Esc confirma', () => {
      const { last } = setup();
      fireEvent.doubleClick(screen.getByText('Fixar comentário com o link do curso'));
      const field = screen.getByRole('textbox', { name: 'Texto da nota' });
      expect(field).toHaveProperty('value', 'Fixar comentário com o link do curso');
      fireEvent.change(field, { target: { value: 'Fixar o link do curso' } });
      fireEvent.keyDown(field, { key: 'Escape' });
      fireEvent.blur(field);
      const note = last().blocks.find((block) => block.id === 'nota-comentario');
      expect(note).toMatchObject({ text: 'Fixar o link do curso' });
      expect(screen.queryByRole('textbox', { name: 'Texto da nota' })).toBeNull();
    });

    it('renomeia a moldura com clique duplo no nome', () => {
      const { last } = setup();
      fireEvent.doubleClick(screen.getByText('Ideias · próximos vídeos'));
      const field = screen.getByRole('textbox', { name: 'Nome da moldura' });
      fireEvent.change(field, { target: { value: 'Ideias' } });
      fireEvent.keyDown(field, { key: 'Enter' });
      fireEvent.blur(field);
      expect(last().frames.find((frame) => frame.id === 'frame-ideias')?.title).toBe('Ideias');
    });

    it('o selo de status do cartão marca e desmarca', () => {
      const { last } = setup();
      const badge = screen.getByRole('checkbox', { name: /Vídeo pronto/ });
      expect(badge.getAttribute('aria-checked')).toBe('true');
      fireEvent.click(badge);
      expect(badge.getAttribute('aria-checked')).toBe('false');
      const card = last().blocks.find((block) => block.id === 'card-projeto');
      expect(card?.type === 'card' && card.status).toMatchObject({ done: false });
    });

    it('as teclas de atalho não disparam enquanto a pessoa escreve', () => {
      setup();
      fireEvent.doubleClick(screen.getByText('Fixar comentário com o link do curso'));
      const field = screen.getByRole('textbox', { name: 'Texto da nota' });
      fireEvent.keyDown(field, { key: 'n' });
      expect(
        screen.getByRole('button', { name: 'Nota adesiva' }).getAttribute('aria-pressed'),
      ).toBe('false');
    });

    it('Esc volta para a ferramenta de selecionar', () => {
      setup();
      fireEvent.keyDown(window, { key: 'r' });
      expect(screen.getByRole('button', { name: 'Forma' }).getAttribute('aria-pressed')).toBe(
        'true',
      );
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.getByRole('button', { name: 'Selecionar' }).getAttribute('aria-pressed')).toBe(
        'true',
      );
    });

    it('Delete apaga o bloco selecionado e as setas e passos que apontavam para ele', async () => {
      const { last } = setup();
      const node = document.querySelector('[data-id="card-projeto"]');
      if (!node) throw new Error('Sem o cartão.');
      fireEvent.click(node);
      fireEvent.keyDown(document.body, { key: 'Delete' });
      await waitFor(() => expect(last().blocks.some((b) => b.id === 'card-projeto')).toBe(false));
      const next = last();
      expect(next.arrows.some((arrow) => arrow.from.nodeId === 'card-projeto')).toBe(false);
      expect(next.presentation[0]?.targetIds).toEqual(['imagem-thumbnail']);
      expect(() => flowContentSchema.parse(next)).not.toThrow();
    });
  });
});

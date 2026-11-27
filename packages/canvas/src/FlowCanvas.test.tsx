import { flowContentSchema, type FlowContent } from '@trama/core';
import { videoFlowExample } from '@trama/core/fixtures';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FlowCanvas } from './FlowCanvas';
import type { CanvasMedia } from './media';

// O jsdom não decodifica imagens: o tamanho original vem daqui nos testes.
vi.mock('./image-size', () => ({
  readImageSize: () => Promise.resolve({ width: 1280, height: 720 }),
}));

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
    expect(screen.getByRole('button', { name: 'Falar e organizar' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByRole('button', { name: 'Seta' })).toHaveProperty('disabled', false);
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

  describe('imagem, vídeo ou link, e etapas (etapa 1.3)', () => {
    function setup(media?: CanvasMedia) {
      const onFlowChange = vi.fn<(next: FlowContent) => void>();
      render(<FlowCanvas flow={flow} onFlowChange={onFlowChange} media={media} />);
      const last = () => {
        const next = onFlowChange.mock.calls.at(-1)?.[0];
        if (!next) throw new Error('O quadro ainda não avisou nenhuma mudança.');
        return next;
      };
      return { onFlowChange, last };
    }
    const board = () => screen.getByTestId('quadro');
    const png = (name = 'thumbnail.png') => new File(['png'], name, { type: 'image/png' });

    it('mostra o vídeo com a duração e só carrega o player ao tocar', () => {
      setup();
      expect(screen.getByText('12:48')).toBeDefined();
      expect(screen.getByText('youtu.be')).toBeDefined();
      expect(document.querySelector('iframe')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Tocar Vídeo final' }));
      const player = document.querySelector('iframe');
      expect(player?.getAttribute('src')).toBe(
        'https://www.youtube-nocookie.com/embed/exemplo1234?autoplay=1&rel=0',
      );
    });

    it('mostra o link comum como cartão com o site', () => {
      setup();
      expect(screen.getByText('Arquivos brutos')).toBeDefined();
      const site = screen.getByRole('link', { name: 'drive.google.com' });
      expect(site.getAttribute('target')).toBe('_blank');
      expect(site.getAttribute('rel')).toBe('noopener noreferrer');
    });

    it('mostra a imagem com o nome e o tamanho original, e avisa quando ela não abre', () => {
      setup();
      expect(screen.getByText('thumbnail-final.png')).toBeDefined();
      expect(screen.getByText('1280×720')).toBeDefined();
      expect(
        screen.getByRole('img', { name: 'thumbnail-final.png: imagem indisponível' }),
      ).toBeDefined();
    });

    it('pede o endereço da imagem ao armazenamento', async () => {
      const media: CanvasMedia = {
        uploadImage: vi.fn(),
        resolveImage: (src) => Promise.resolve(`https://arquivos.exemplo/${src}`),
      };
      setup(media);
      await waitFor(() =>
        expect(screen.getByRole('img', { name: 'thumbnail-final.png' }).getAttribute('src')).toBe(
          'https://arquivos.exemplo/projects/exemplo/thumbnail-final.png',
        ),
      );
    });

    it('marca e desmarca etapas, e o contador acompanha', () => {
      const { last } = setup();
      expect(screen.getByText('5/5')).toBeDefined();
      fireEvent.click(screen.getByRole('checkbox', { name: 'Edição' }));
      expect(screen.getByText('4/5')).toBeDefined();
      const etapas = last().blocks.find((block) => block.id === 'etapas');
      expect(etapas?.type === 'checklist' && etapas.items[2]).toMatchObject({
        text: 'Edição',
        done: false,
      });
    });

    it('edita as etapas: Enter cria a próxima, Esc confirma e o bloco cresce', () => {
      const { last } = setup();
      fireEvent.doubleClick(screen.getByText('Roteiro'));
      const fifth = screen.getByRole('textbox', { name: 'Etapa 5' });
      fireEvent.keyDown(fifth, { key: 'Enter' });
      const sixth = screen.getByRole('textbox', { name: 'Etapa 6' });
      expect(document.activeElement).toBe(sixth);
      fireEvent.change(sixth, { target: { value: 'Responder comentários' } });
      fireEvent.keyDown(sixth, { key: 'Escape' });
      const etapas = last().blocks.find((block) => block.id === 'etapas');
      expect(etapas?.type === 'checklist' && etapas.items.map((item) => item.text)).toEqual([
        'Roteiro',
        'Gravação',
        'Edição',
        'Thumbnail',
        'Publicar',
        'Responder comentários',
      ]);
      expect(etapas?.size.height).toBe(264);
      expect(screen.getByText('5/6')).toBeDefined();
    });

    it('a tecla E cria uma lista de etapas pronta para escrever', () => {
      const { last } = setup();
      fireEvent.keyDown(window, { key: 'e' });
      const init = { button: 0, isPrimary: true, pointerId: 1, clientX: 300, clientY: 300 };
      const pane = document.querySelector('.react-flow__pane');
      if (!pane) throw new Error('Sem o fundo do quadro.');
      fireEvent.pointerDown(pane, init);
      fireEvent.pointerUp(pane, init);
      expect(last().blocks.at(-1)?.type).toBe('checklist');
      expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Etapa 1' }));
    });

    it('o botão Vídeo ou link abre a caixa para colar o link', () => {
      const { last } = setup();
      fireEvent.click(screen.getByRole('button', { name: 'Vídeo ou link' }));
      const field = screen.getByRole('textbox', { name: /Vídeo do YouTube/ });
      fireEvent.change(field, { target: { value: 'oi' } });
      fireEvent.submit(field);
      expect(screen.getByText(/Esse link não parece certo/)).toBeDefined();
      fireEvent.change(field, { target: { value: 'vimeo.com/76979871' } });
      fireEvent.submit(field);
      expect(last().blocks.at(-1)).toMatchObject({
        type: 'link',
        url: 'https://vimeo.com/76979871',
        size: { width: 320, height: 216 },
      });
      expect(screen.queryByRole('textbox', { name: /Vídeo do YouTube/ })).toBeNull();
    });

    it('a caixa do link aceita "vimeo.com/..." sem a validação do navegador e fecha no quadro', () => {
      setup();
      fireEvent.click(screen.getByRole('button', { name: 'Vídeo ou link' }));
      const field = screen.getByRole('textbox', { name: /Vídeo do YouTube/ });
      // Sem isso, o navegador barra o Enter antes do nosso código ver o link.
      expect(field.closest('form')?.noValidate).toBe(true);
      const pane = document.querySelector('.react-flow__pane');
      if (!pane) throw new Error('Sem o fundo do quadro.');
      const init = { button: 0, isPrimary: true, pointerId: 1, clientX: 600, clientY: 400 };
      fireEvent.pointerDown(pane, init);
      fireEvent.pointerUp(pane, init);
      expect(screen.queryByRole('textbox', { name: /Vídeo do YouTube/ })).toBeNull();
    });

    it('colar um link no quadro cria o bloco', () => {
      const { last } = setup();
      fireEvent.paste(window, {
        clipboardData: { files: [], getData: () => 'https://trama.app/ajuda' },
      });
      expect(last().blocks.at(-1)).toMatchObject({ type: 'link', url: 'https://trama.app/ajuda' });
    });

    it('colar texto comum não cria nada', () => {
      const { onFlowChange } = setup();
      fireEvent.paste(window, { clipboardData: { files: [], getData: () => 'só um texto' } });
      expect(onFlowChange).not.toHaveBeenCalled();
    });

    it('soltar uma imagem sobe o arquivo e cria o bloco com o tamanho original', async () => {
      const uploadImage = vi.fn((file: File) => Promise.resolve(`u1/${file.name}`));
      const { last } = setup({ uploadImage, resolveImage: () => null });
      fireEvent.drop(board(), {
        clientX: 400,
        clientY: 300,
        dataTransfer: { files: [png()], types: ['Files'], getData: () => '' },
      });
      await waitFor(() =>
        expect(last().blocks.at(-1)).toMatchObject({
          type: 'image',
          src: 'u1/thumbnail.png',
          fileName: 'thumbnail.png',
          naturalSize: { width: 1280, height: 720 },
          size: { width: 280, height: 200 },
        }),
      );
      expect(uploadImage).toHaveBeenCalledTimes(1);
      expect(() => flowContentSchema.parse(last())).not.toThrow();
    });

    it('recusa arquivo que não é imagem, com aviso', () => {
      const uploadImage = vi.fn();
      setup({ uploadImage, resolveImage: () => null });
      fireEvent.drop(board(), {
        dataTransfer: {
          files: [new File(['x'], 'notas.txt', { type: 'text/plain' })],
          types: ['Files'],
          getData: () => '',
        },
      });
      expect(screen.getByRole('status').textContent).toBe('Use uma imagem PNG, JPG, WebP ou GIF.');
      expect(uploadImage).not.toHaveBeenCalled();
    });

    it('avisa quando o envio falha e não cria o bloco', async () => {
      const { onFlowChange } = setup({
        uploadImage: () => Promise.reject(new Error('sem rede')),
        resolveImage: () => null,
      });
      fireEvent.drop(board(), {
        dataTransfer: { files: [png()], types: ['Files'], getData: () => '' },
      });
      await waitFor(() =>
        expect(screen.getByRole('status').textContent).toBe(
          'Não deu para enviar a imagem. Tente de novo.',
        ),
      );
      expect(onFlowChange).not.toHaveBeenCalled();
    });
  });
});

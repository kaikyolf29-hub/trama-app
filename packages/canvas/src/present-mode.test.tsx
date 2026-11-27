import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { flowContentSchema, type FlowContent } from '@trama/core';
import { videoFlowExample } from '@trama/core/fixtures';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FlowCanvas, type CanvasControls } from './FlowCanvas';
import { localMedia } from './media';
import { Presenter } from './present-mode';

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

function setup(content: FlowContent = flow) {
  const onExit = vi.fn();
  render(<Presenter flow={content} title="Aula de edição" media={localMedia} onExit={onExit} />);
  return { onExit };
}
const progress = () => screen.getByText(/^Passo \d+ de \d+$/).textContent;
const states = () =>
  Array.from(document.querySelectorAll('[data-state]'), (el) => el.getAttribute('data-state'));

describe('modo aula (tela 2)', () => {
  it('abre no passo 1, com o nome do projeto e as saídas', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Modo aula' })).toBeDefined();
    expect(screen.getByText('MODO AULA')).toBeDefined();
    expect(screen.getByText('Aula de edição')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Voltar ao editor' })).toBeDefined();
    expect(progress()).toBe('Passo 1 de 4');
    expect(screen.getByRole('button', { name: 'Passo anterior' })).toHaveProperty('disabled', true);
  });

  it('mostra o passo de agora em destaque e os próximos como "ainda oculto"', () => {
    setup();
    // Um quadro tracejado para cada bloco do passo. O título do passo 2 é baixo demais para o
    // texto, então só os outros dois dizem "ainda oculto".
    expect(screen.getAllByText('Passo 2 · ainda oculto')).toHaveLength(2);
    expect(screen.getAllByText('Passo 3 · ainda oculto')).toHaveLength(2);
    expect(screen.getAllByText('Passo 4 · ainda oculto')).toHaveLength(1);
    expect(document.querySelectorAll('.border-dashed')).toHaveLength(6);
    expect(states()).toContain('current');
    // Os blocos dos próximos passos não aparecem de verdade.
    expect(screen.queryByText('Fixar comentário com o link do curso')).toBeNull();
    // O bloco do passo 1 aparece.
    expect(screen.getAllByText('Como editar 10x mais rápido').length).toBeGreaterThan(0);
  });

  it('avança e volta pelos botões, e o passo que passou fica discreto', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Próximo passo' }));
    expect(progress()).toBe('Passo 2 de 4');
    expect(screen.queryByText('Passo 2 · ainda oculto')).toBeNull();
    expect(states()).toContain('past');
    fireEvent.click(screen.getByRole('button', { name: 'Passo anterior' }));
    expect(progress()).toBe('Passo 1 de 4');
    expect(states()).not.toContain('past');
  });

  it('setas, espaço, PageDown e PageUp também navegam, sem passar do começo nem do fim', () => {
    setup();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(progress()).toBe('Passo 1 de 4');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: ' ' });
    fireEvent.keyDown(window, { key: 'PageDown' });
    expect(progress()).toBe('Passo 4 de 4');
    expect(screen.getByRole('button', { name: 'Próximo passo' })).toHaveProperty('disabled', true);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(progress()).toBe('Passo 4 de 4');
    fireEvent.keyDown(window, { key: 'PageUp' });
    expect(progress()).toBe('Passo 3 de 4');
    fireEvent.keyDown(window, { key: 'Home' });
    expect(progress()).toBe('Passo 1 de 4');
    fireEvent.keyDown(window, { key: 'End' });
    expect(progress()).toBe('Passo 4 de 4');
  });

  it('Esc e "Voltar ao editor" saem', () => {
    const { onExit } = setup();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onExit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao editor' }));
    expect(onExit).toHaveBeenCalledTimes(2);
  });

  it('anuncia o passo para leitores de tela', () => {
    setup();
    expect(screen.getByRole('status').textContent).toMatch(/^Passo 1 de 4: /);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByRole('status').textContent).toBe('Passo 4 de 4: Próximos vídeos');
  });

  it('segue funcionando quando o navegador recusa a tela cheia', () => {
    Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true });
    const request = vi.fn(() => Promise.reject(new Error('recusado')));
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      value: request,
      configurable: true,
    });
    try {
      const { onExit } = setup();
      expect(request).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('dialog', { name: 'Modo aula' })).toBeDefined();
      expect(onExit).not.toHaveBeenCalled();
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(progress()).toBe('Passo 2 de 4');
    } finally {
      Reflect.deleteProperty(HTMLElement.prototype, 'requestFullscreen');
      Reflect.deleteProperty(document, 'fullscreenEnabled');
    }
  });

  it('sai quando a pessoa sai da tela cheia pelo navegador', () => {
    Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true });
    let element: Element | null = null;
    Object.defineProperty(document, 'fullscreenElement', {
      get: () => element,
      configurable: true,
    });
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      value() {
        element = this as Element;
        document.dispatchEvent(new Event('fullscreenchange'));
        return Promise.resolve();
      },
      configurable: true,
    });
    try {
      const { onExit } = setup();
      expect(onExit).not.toHaveBeenCalled();
      element = null;
      document.dispatchEvent(new Event('fullscreenchange'));
      expect(onExit).toHaveBeenCalledTimes(1);
    } finally {
      Reflect.deleteProperty(HTMLElement.prototype, 'requestFullscreen');
      Reflect.deleteProperty(document, 'fullscreenEnabled');
      Reflect.deleteProperty(document, 'fullscreenElement');
    }
  });

  describe('sem passos', () => {
    const empty: FlowContent = { ...flow, presentation: [] };

    it('mostra o quadro todo e explica como criar passos', () => {
      setup(empty);
      expect(screen.getByText(/ainda não tem passos/)).toBeDefined();
      expect(screen.queryByRole('button', { name: 'Próximo passo' })).toBeNull();
      expect(screen.queryByText(/ainda oculto/)).toBeNull();
      expect(screen.getByText('Fixar comentário com o link do curso')).toBeDefined();
    });

    it('as teclas não quebram e Esc sai', () => {
      const { onExit } = setup(empty);
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onExit).toHaveBeenCalledTimes(1);
    });
  });

  describe('caneta e destaque', () => {
    const pane = () => screen.getByTestId('caneta');
    const draw = (from: [number, number], to: [number, number]) => {
      fireEvent.pointerDown(pane(), {
        button: 0,
        pointerId: 1,
        clientX: from[0],
        clientY: from[1],
      });
      fireEvent.pointerMove(pane(), { pointerId: 1, clientX: to[0], clientY: to[1] });
      fireEvent.pointerUp(pane(), { pointerId: 1, clientX: to[0], clientY: to[1] });
    };

    it('os botões ligam e desligam, e só um vale de cada vez', () => {
      setup();
      const pen = screen.getByRole('button', { name: 'Caneta' });
      const laser = screen.getByRole('button', { name: 'Destaque' });
      expect(pen.getAttribute('aria-pressed')).toBe('false');
      fireEvent.click(pen);
      expect(pen.getAttribute('aria-pressed')).toBe('true');
      fireEvent.click(laser);
      expect(pen.getAttribute('aria-pressed')).toBe('false');
      expect(laser.getAttribute('aria-pressed')).toBe('true');
      expect(screen.getByTestId('destaque')).toBeDefined();
      fireEvent.click(laser);
      expect(screen.queryByTestId('destaque')).toBeNull();
    });

    it('as teclas P e L fazem o mesmo', () => {
      setup();
      fireEvent.keyDown(window, { key: 'p' });
      expect(screen.getByRole('button', { name: 'Caneta' }).getAttribute('aria-pressed')).toBe(
        'true',
      );
      fireEvent.keyDown(window, { key: 'l' });
      expect(screen.getByRole('button', { name: 'Destaque' }).getAttribute('aria-pressed')).toBe(
        'true',
      );
    });

    it('desenha na cor de seleção, e o desenho some ao trocar de passo', () => {
      setup();
      fireEvent.click(screen.getByRole('button', { name: 'Caneta' }));
      draw([10, 10], [80, 60]);
      const paths = pane().querySelectorAll('path');
      expect(paths).toHaveLength(1);
      expect(paths[0]?.getAttribute('stroke')).toBe('#2383E2');
      expect(screen.getByRole('button', { name: 'Limpar' })).toBeDefined();
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(pane().querySelectorAll('path')).toHaveLength(0);
      expect(screen.queryByRole('button', { name: 'Limpar' })).toBeNull();
    });

    it('com a caneta desligada o desenho não nasce e o Limpar apaga o que tem', () => {
      setup();
      draw([10, 10], [80, 60]);
      expect(pane().querySelectorAll('path')).toHaveLength(0);
      fireEvent.click(screen.getByRole('button', { name: 'Caneta' }));
      draw([10, 10], [80, 60]);
      fireEvent.click(screen.getByRole('button', { name: 'Caneta' }));
      expect(pane().querySelectorAll('path')).toHaveLength(1);
      fireEvent.click(screen.getByRole('button', { name: 'Limpar' }));
      expect(pane().querySelectorAll('path')).toHaveLength(0);
    });
  });
});

describe('Apresentar no quadro', () => {
  function board(onFlowChange = vi.fn<(next: FlowContent) => void>()) {
    let controls: CanvasControls | undefined;
    render(
      <FlowCanvas
        flow={flow}
        title="Aula"
        onFlowChange={onFlowChange}
        topRight={(c) => {
          controls = c;
          return (
            <button type="button" onClick={c.present}>
              Apresentar
            </button>
          );
        }}
      />,
    );
    return { onFlowChange, controls: () => controls };
  }

  it('abre o modo aula, deixa o quadro do editor quieto e volta ao sair', () => {
    const { onFlowChange } = board();
    fireEvent.click(screen.getByRole('button', { name: 'Apresentar' }));
    const dialog = screen.getByRole('dialog', { name: 'Modo aula' });
    expect(within(dialog).getByText('Aula')).toBeDefined();
    expect(screen.getByTestId('quadro').hasAttribute('inert')).toBe(true);

    // As teclas do editor ficam quietas: T não escolhe o texto, Ctrl+Z não desfaz.
    fireEvent.keyDown(window, { key: 't' });
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Modo aula' })).toBeNull();
    expect(screen.getByTestId('quadro').hasAttribute('inert')).toBe(false);
    expect(screen.getByRole('button', { name: 'Selecionar' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    // Apresentar, desenhar e navegar não mudam o fluxo salvo.
    expect(onFlowChange).not.toHaveBeenCalled();
  });

  it('mostra o fluxo de agora, com o que foi mudado no painel', () => {
    board();
    fireEvent.click(screen.getByRole('button', { name: 'Ordem da apresentação' }));
    for (let n = 0; n < 4; n += 1) {
      fireEvent.click(screen.getByRole('button', { name: `Apagar o passo ${4 - n}` }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Apresentar' }));
    expect(screen.getByText(/ainda não tem passos/)).toBeDefined();
  });
});

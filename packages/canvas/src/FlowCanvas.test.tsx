import { flowContentSchema } from '@trama/core';
import { videoFlowExample } from '@trama/core/fixtures';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
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
    expect(screen.getByRole('button', { name: 'Nota adesiva' })).toHaveProperty('disabled', true);
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
});

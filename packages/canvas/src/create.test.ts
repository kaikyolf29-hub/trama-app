import { describe, expect, it } from 'vitest';
import { createBlock, createFrame, DEFAULT_SIZES } from './create';
import { parseTextLines } from './text-lines';

describe('createBlock', () => {
  it('cria cada tipo com os padrões do core, centralizado no clique e na grade de 8 px', () => {
    const sticky = createBlock('sticky', { x: 403, y: 211 }, 'n1');
    expect(sticky).toMatchObject({
      id: 'n1',
      type: 'sticky',
      color: 'yellow',
      text: '',
      size: DEFAULT_SIZES.sticky,
      position: { x: 320, y: 136 },
    });
    expect(sticky.position.x % 8).toBe(0);
    expect(sticky.position.y % 8).toBe(0);
  });

  it('cria texto, cartão e forma vazios', () => {
    expect(createBlock('text', { x: 0, y: 0 })).toMatchObject({
      type: 'text',
      text: '',
      font: 'sans',
    });
    expect(createBlock('card', { x: 0, y: 0 })).toMatchObject({ type: 'card', title: '' });
    expect(createBlock('shape', { x: 0, y: 0 })).toMatchObject({
      type: 'shape',
      shape: 'rectangle',
    });
  });

  it('cria moldura com um nome para a pessoa trocar', () => {
    expect(createFrame({ x: 240, y: 160 }, 'f1')).toMatchObject({
      id: 'f1',
      title: 'Nova seção',
      position: { x: 0, y: 0 },
    });
  });

  it('gera ids diferentes', () => {
    expect(createBlock('text', { x: 0, y: 0 }).id).not.toBe(createBlock('text', { x: 0, y: 0 }).id);
  });
});

describe('parseTextLines', () => {
  it('separa parágrafos e listas', () => {
    expect(
      parseTextLines('Como vai ser\n- Gancho\n- Atalhos\n\n1. Gravar\n2. Editar\nFim'),
    ).toEqual([
      { kind: 'paragraph', text: 'Como vai ser' },
      { kind: 'bullets', items: ['Gancho', 'Atalhos'] },
      { kind: 'numbered', items: ['Gravar', 'Editar'] },
      { kind: 'paragraph', text: 'Fim' },
    ]);
  });

  it('não vira lista sem o espaço depois do marcador', () => {
    expect(parseTextLines('-traço\n2026.')).toEqual([
      { kind: 'paragraph', text: '-traço' },
      { kind: 'paragraph', text: '2026.' },
    ]);
  });
});

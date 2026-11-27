import { describe, expect, it } from 'vitest';
import {
  checklistHeight,
  createBlock,
  createFrame,
  createImageBlock,
  createLinkBlock,
  DEFAULT_SIZES,
  imageBlockSize,
  LINK_SIZES,
  normalizeLink,
} from './create';
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

describe('blocos da etapa 1.3', () => {
  it('cria etapas com uma etapa vazia e a altura da lista', () => {
    const block = createBlock('checklist', { x: 0, y: 0 });
    expect(block).toMatchObject({
      type: 'checklist',
      title: 'Etapas',
      size: DEFAULT_SIZES.checklist,
    });
    expect(block.type === 'checklist' && block.items).toHaveLength(1);
    expect(checklistHeight(1)).toBe(DEFAULT_SIZES.checklist.height);
    // As 5 etapas da tela 1 cabem em 232 px, como no fluxo de exemplo.
    expect(checklistHeight(5)).toBe(232);
  });

  it('dimensiona a imagem pela proporção, na grade, sem esticar imagem pequena', () => {
    expect(imageBlockSize({ width: 1280, height: 720 })).toEqual({ width: 280, height: 200 });
    expect(imageBlockSize({ width: 100, height: 100 })).toEqual({ width: 160, height: 200 });
    const tall = imageBlockSize({ width: 1000, height: 2000 });
    expect(tall.width % 8).toBe(0);
    expect(tall.height % 8).toBe(0);
    expect(tall.height).toBeLessThanOrEqual(360 + 40);
    expect(imageBlockSize()).toEqual({ width: 280, height: 200 });
  });

  it('cria a imagem com o nome e o tamanho original', () => {
    const block = createImageBlock(
      { x: 500, y: 300 },
      { src: 'u1/foto.png', fileName: 'foto.png', naturalSize: { width: 1280, height: 720 } },
    );
    expect(block).toMatchObject({
      type: 'image',
      src: 'u1/foto.png',
      fileName: 'foto.png',
      naturalSize: { width: 1280, height: 720 },
      position: { x: 360, y: 200 },
      size: { width: 280, height: 200 },
    });
  });

  it('cria vídeo do YouTube ou Vimeo maior que um link comum', () => {
    expect(createLinkBlock({ x: 0, y: 0 }, 'https://youtu.be/dQw4w9WgXcQ').size).toEqual(
      LINK_SIZES.video,
    );
    expect(createLinkBlock({ x: 0, y: 0 }, 'https://vimeo.com/76979871').size).toEqual(
      LINK_SIZES.video,
    );
    expect(createLinkBlock({ x: 0, y: 0 }, 'https://trama.app/ajuda').size).toEqual(LINK_SIZES.web);
  });

  it('aceita só links http(s) de verdade', () => {
    expect(normalizeLink('  youtu.be/dQw4w9WgXcQ ')).toBe('https://youtu.be/dQw4w9WgXcQ');
    expect(normalizeLink('http://exemplo.com/a?b=1')).toBe('http://exemplo.com/a?b=1');
    expect(normalizeLink('javascript:alert(1)')).toBeNull();
    expect(normalizeLink('ftp://exemplo.com')).toBeNull();
    expect(normalizeLink('oi')).toBeNull();
    expect(normalizeLink('')).toBeNull();
  });
});

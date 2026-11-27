import { describe, expect, it } from 'vitest';
import { blockSchema, blockTypes, checklistProgress } from './blocks';

const at = { id: 'b', position: { x: 0, y: 0 }, size: { width: 160, height: 80 } };

describe('blockSchema', () => {
  it('conhece os oito tipos de bloco', () => {
    expect(blockTypes).toEqual([
      'text',
      'card',
      'sticky',
      'shape',
      'image',
      'link',
      'checklist',
      'audio',
    ]);
  });

  it('recusa tipo desconhecido', () => {
    expect(blockSchema.safeParse({ ...at, type: 'emoji' }).success).toBe(false);
  });

  it('aceita só nomes de token como cor, nunca hex', () => {
    expect(blockSchema.safeParse({ ...at, type: 'sticky', color: 'pink' }).success).toBe(true);
    expect(blockSchema.safeParse({ ...at, type: 'sticky', color: '#EDB1CE' }).success).toBe(false);
    expect(blockSchema.safeParse({ ...at, type: 'text', color: '#FFFFFF' }).success).toBe(false);
  });

  it('recusa tamanho zero ou negativo', () => {
    expect(
      blockSchema.safeParse({ ...at, size: { width: 0, height: 10 }, type: 'shape' }).success,
    ).toBe(false);
  });

  it('cartão aceita o selo "Vídeo pronto" com data e hora', () => {
    const block = blockSchema.parse({
      ...at,
      type: 'card',
      title: 'Como editar 10x mais rápido',
      status: { done: true, doneAt: '2026-11-12T19:40:00-03:00' },
    });
    expect(block.type === 'card' && block.status).toEqual({
      label: 'Vídeo pronto',
      done: true,
      doneAt: '2026-11-12T19:40:00-03:00',
    });
  });

  it('cartão recusa selo marcado sem data, ou data sem marcar', () => {
    expect(blockSchema.safeParse({ ...at, type: 'card', status: { done: true } }).success).toBe(
      false,
    );
    expect(
      blockSchema.safeParse({
        ...at,
        type: 'card',
        status: { done: false, doneAt: '2026-11-12T19:40:00Z' },
      }).success,
    ).toBe(false);
  });

  it('link aceita só http e https', () => {
    expect(blockSchema.safeParse({ ...at, type: 'link', url: 'https://vimeo.com/1' }).success).toBe(
      true,
    );
    expect(blockSchema.safeParse({ ...at, type: 'link', url: 'javascript:alert(1)' }).success).toBe(
      false,
    );
  });

  it('imagem recusa recorte que sai da imagem', () => {
    const image = { ...at, type: 'image', src: 'projects/p/a.png' };
    expect(
      blockSchema.safeParse({ ...image, crop: { x: 0.1, y: 0, width: 0.9, height: 1 } }).success,
    ).toBe(true);
    expect(
      blockSchema.safeParse({ ...image, crop: { x: 0.5, y: 0, width: 0.6, height: 1 } }).success,
    ).toBe(false);
  });

  it('etapas recusam id de item repetido', () => {
    const result = blockSchema.safeParse({
      ...at,
      type: 'checklist',
      items: [
        { id: 'e1', text: 'Roteiro' },
        { id: 'e1', text: 'Gravação' },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('etapas têm título "Etapas" por padrão', () => {
    expect(blockSchema.parse({ ...at, type: 'checklist' })).toMatchObject({
      title: 'Etapas',
      items: [],
    });
  });
});

describe('checklistProgress', () => {
  it('conta as etapas feitas', () => {
    expect(checklistProgress([{ done: true }, { done: false }, { done: true }])).toEqual({
      done: 2,
      total: 3,
      complete: false,
    });
  });

  it('está completo só quando há etapas e todas estão feitas', () => {
    expect(checklistProgress([{ done: true }, { done: true }]).complete).toBe(true);
    expect(checklistProgress([]).complete).toBe(false);
  });
});

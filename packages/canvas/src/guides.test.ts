import { describe, expect, it } from 'vitest';
import { alignmentGuides } from './guides';

const card = { x: 144, y: 128, width: 280, height: 144 };

describe('guias de alinhamento', () => {
  it('encaixa a borda esquerda e mostra a linha vertical', () => {
    const moving = { x: 152, y: 400, width: 160, height: 152 };
    const guides = alignmentGuides(moving, [card], 12);
    expect(guides.x).toBe(144);
    expect(guides.vertical).toContain(144);
    expect(guides.y).toBeUndefined();
  });

  it('alinha o meio quando o encaixe fica na grade', () => {
    // meio do cartão em x = 284; um bloco de 120 px com meio em 284 começa em 224.
    const moving = { x: 232, y: 400, width: 120, height: 80 };
    const guides = alignmentGuides(moving, [card], 12);
    expect(guides.x).toBe(224);
    expect(guides.vertical).toContain(284);
  });

  it('não encaixa fora da grade de 8 px', () => {
    // meio do cartão em 284; com largura 100, o encaixe pediria x = 234, fora da grade.
    const moving = { x: 232, y: 400, width: 100, height: 80 };
    expect(alignmentGuides(moving, [card], 12).x).not.toBe(234);
  });

  it('alinha o topo com o topo, nos dois eixos de uma vez', () => {
    const moving = { x: 440, y: 136, width: 160, height: 152 };
    const guides = alignmentGuides(moving, [card], 12);
    expect(guides.y).toBe(128);
    expect(guides.horizontal).toContain(128);
    // a borda esquerda (440) está a 16 px da direita do cartão (424): fora do limite.
    expect(guides.x).toBeUndefined();
  });

  it('longe de tudo, não mostra guia', () => {
    const guides = alignmentGuides({ x: 900, y: 900, width: 80, height: 80 }, [card], 12);
    expect(guides).toEqual({ vertical: [], horizontal: [] });
  });
});

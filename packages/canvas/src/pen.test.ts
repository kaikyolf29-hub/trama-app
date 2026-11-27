import { describe, expect, it } from 'vitest';
import { extendStroke, MIN_POINT_GAP, strokePath } from './pen';

describe('caneta', () => {
  it('só junta o ponto que andou o suficiente', () => {
    const start = [{ x: 0, y: 0 }];
    expect(extendStroke(start, { x: 0, y: MIN_POINT_GAP - 1 })).toBe(start);
    expect(extendStroke(start, { x: 0, y: MIN_POINT_GAP })).toHaveLength(2);
  });

  it('traço vazio não desenha nada, e um ponto só vira um pontinho', () => {
    expect(strokePath([])).toBe('');
    expect(strokePath([{ x: 10, y: 20 }])).toBe('M 10 20 l 0 0');
  });

  it('dois pontos viram uma linha reta', () => {
    expect(
      strokePath([
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ]),
    ).toBe('M 0 0 L 5 5 L 10 10');
  });

  it('vários pontos viram curvas pelo meio de cada par', () => {
    const path = strokePath([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
    expect(path).toBe('M 0 0 L 5 0 Q 10 0 10 5 L 10 10');
  });
});

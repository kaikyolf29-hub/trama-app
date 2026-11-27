import { getViewportForBounds } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { FIT_VIEW } from './fit';

const screen = { width: 1440, height: 900 };
const view = (bounds: { x: number; y: number; width: number; height: number }) =>
  getViewportForBounds(
    bounds,
    screen.width,
    screen.height,
    0.1,
    FIT_VIEW.maxZoom,
    FIT_VIEW.padding,
  );

describe('ajuste do quadro', () => {
  it('um bloco pequeno não abre gigante: o zoom para em 100%', () => {
    expect(view({ x: 0, y: 0, width: 240, height: 120 }).zoom).toBe(1);
  });

  it('um fluxo grande continua sendo afastado para caber', () => {
    expect(view({ x: 0, y: 0, width: 6000, height: 3000 }).zoom).toBeLessThan(0.5);
  });
});

import { flowContentSchema } from '@trama/core';
import { videoFlowExample } from '@trama/core/fixtures';
import { describe, expect, it } from 'vitest';
import { canConnect, sideOf } from './arrows';
import { createArrow } from './create';

const { arrows } = flowContentSchema.parse(videoFlowExample);

describe('setas', () => {
  it('liga dois nós que ainda não estão ligados', () => {
    expect(canConnect(arrows, 'card-projeto', 'nota-comentario')).toBe(true);
  });

  it('não liga um nó a ele mesmo nem repete uma ligação, em qualquer sentido', () => {
    expect(canConnect(arrows, 'card-projeto', 'card-projeto')).toBe(false);
    expect(canConnect(arrows, 'card-projeto', 'video-final')).toBe(false);
    expect(canConnect(arrows, 'video-final', 'card-projeto')).toBe(false);
    expect(canConnect(arrows, '', 'video-final')).toBe(false);
  });

  it('lê o lado pelo id do ponto de conexão', () => {
    expect(sideOf('right')).toEqual({ side: 'right' });
    expect(sideOf('meio')).toEqual({});
    expect(sideOf(null)).toEqual({});
  });

  it('cria a seta curva, validada pelo core', () => {
    const arrow = createArrow({ nodeId: 'a', side: 'right' }, { nodeId: 'b' }, 's1');
    expect(arrow).toEqual({
      id: 's1',
      from: { nodeId: 'a', side: 'right' },
      to: { nodeId: 'b' },
      route: 'curved',
    });
    expect(() => createArrow({ nodeId: 'a' }, { nodeId: 'a' })).toThrow();
  });
});

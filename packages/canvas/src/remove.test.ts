import { flowContentSchema } from '@trama/core';
import { videoFlowExample } from '@trama/core/fixtures';
import { describe, expect, it } from 'vitest';
import { removeNodes } from './remove';

const flow = flowContentSchema.parse(videoFlowExample);

describe('removeNodes', () => {
  it('apaga o bloco, as setas ligadas a ele e o tira do passo da aula', () => {
    const next = removeNodes(flow, ['video-final']);
    expect(next.blocks.some((block) => block.id === 'video-final')).toBe(false);
    expect(next.arrows.map((arrow) => arrow.id)).toEqual([
      'seta-projeto-thumbnail',
      'seta-thumbnail-texto',
    ]);
    expect(next.presentation[1]?.targetIds).toEqual(['texto-titulo', 'texto-roteiro']);
    expect(flowContentSchema.safeParse(next).success).toBe(true);
  });

  it('apaga o passo que ficar vazio', () => {
    const next = removeNodes(flow, ['frame-ideias']);
    expect(next.presentation.map((step) => step.id)).toEqual(['passo-1', 'passo-2', 'passo-3']);
  });

  it('solta da moldura os blocos cuja moldura saiu, e o fluxo continua válido', () => {
    const next = removeNodes(flow, ['frame-ideias']);
    const sticky = next.blocks.find((block) => block.id === 'ideia-erros');
    expect(sticky?.frameId).toBeUndefined();
    expect(flowContentSchema.safeParse(next).success).toBe(true);
  });

  it('não muda nada sem ids', () => {
    expect(removeNodes(flow, [])).toBe(flow);
  });
});

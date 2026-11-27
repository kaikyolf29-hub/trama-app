import { flowContentSchema, presentationStepNumber } from '@trama/core';
import { videoFlowExample } from '@trama/core/fixtures';
import { describe, expect, it } from 'vitest';
import { setNodeStep } from './steps';

const { presentation } = flowContentSchema.parse(videoFlowExample);

describe('passo da aula', () => {
  it('muda o nó de passo, sem repetir em dois', () => {
    const next = setNodeStep(presentation, 'nota-comentario', 1);
    expect(presentationStepNumber(next, 'nota-comentario')).toBe(1);
    expect(next.filter((step) => step.targetIds.includes('nota-comentario'))).toHaveLength(1);
  });

  it('cria um passo novo no fim', () => {
    const next = setNodeStep(presentation, 'ideia-erros', 'new');
    expect(next).toHaveLength(presentation.length + 1);
    expect(presentationStepNumber(next, 'ideia-erros')).toBe(5);
  });

  it('tira da aula e apaga o passo que fica vazio', () => {
    const next = setNodeStep(presentation, 'frame-ideias', null);
    expect(next).toHaveLength(presentation.length - 1);
    expect(presentationStepNumber(next, 'frame-ideias')).toBeUndefined();
  });

  it('o único nó de um passo, ao ir para outro, leva a numeração junto', () => {
    // frame-ideias está sozinho no passo 4; indo para o passo 1, o passo 4 some.
    const next = setNodeStep(presentation, 'frame-ideias', 1);
    expect(next).toHaveLength(3);
    expect(presentationStepNumber(next, 'frame-ideias')).toBe(1);
  });
});

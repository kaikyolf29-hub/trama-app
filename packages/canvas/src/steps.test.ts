import { flowContentSchema, presentationStepNumber } from '@trama/core';
import { videoFlowExample } from '@trama/core/fixtures';
import { describe, expect, it } from 'vitest';
import { addStep, moveStep, removeStep, renameStep, setNodeStep } from './steps';

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

const ids = (steps: readonly { id: string }[]) => steps.map((step) => step.id);

describe('ordem da apresentação', () => {
  it('sobe e desce um passo, e a numeração anda junto', () => {
    const down = moveStep(presentation, 0, 2);
    expect(ids(down)).toEqual(['passo-2', 'passo-3', 'passo-1', 'passo-4']);
    expect(presentationStepNumber(down, 'card-projeto')).toBe(3);
    expect(ids(moveStep(down, 2, 0))).toEqual(ids(presentation));
  });

  it('não muda nada quando o destino é o mesmo ou está fora da lista', () => {
    expect(moveStep(presentation, 1, 1)).toEqual(presentation);
    expect(moveStep(presentation, 0, -1)).toEqual(presentation);
    expect(moveStep(presentation, 3, 4)).toEqual(presentation);
  });

  it('renomeia o passo, aparando os espaços, e nome vazio tira o nome', () => {
    const named = renameStep(presentation, 'passo-1', '  Abertura  ');
    expect(named[0]?.title).toBe('Abertura');
    const cleared = renameStep(named, 'passo-1', '   ');
    expect(cleared[0]).not.toHaveProperty('title');
    expect(renameStep(presentation, 'passo-4', 'Outro')[3]?.title).toBe('Outro');
  });

  it('limita o nome a 120 caracteres, o limite do core', () => {
    expect(renameStep(presentation, 'passo-1', 'a'.repeat(300))[0]?.title).toHaveLength(120);
  });

  it('apaga o passo sem mexer nos outros', () => {
    const next = removeStep(presentation, 'passo-2');
    expect(ids(next)).toEqual(['passo-1', 'passo-3', 'passo-4']);
    expect(presentationStepNumber(next, 'etapas')).toBe(2);
  });

  it('cria um passo no fim com a seleção, tirando os nós de onde estavam', () => {
    const next = addStep(presentation, ['ideia-erros', 'etapas']);
    expect(next).toHaveLength(5);
    expect(next[4]?.targetIds).toEqual(['ideia-erros', 'etapas']);
    expect(next[2]?.targetIds).toEqual(['nota-comentario']);
  });

  it('o passo que fica vazio ao tirar a seleção some', () => {
    const next = addStep(presentation, ['frame-ideias', 'card-projeto']);
    expect(ids(next).slice(0, 3)).toEqual(['passo-1', 'passo-2', 'passo-3']);
    expect(next).toHaveLength(4);
    expect(next[3]?.targetIds).toEqual(['frame-ideias', 'card-projeto']);
  });

  it('sem seleção não cria passo', () => {
    expect(addStep(presentation, [])).toEqual(presentation);
  });

  it('o resultado sempre passa no esquema do core', () => {
    const next = addStep(moveStep(presentation, 0, 3), ['ideia-davinci']);
    expect(() =>
      flowContentSchema.parse({ ...flowContentSchema.parse(videoFlowExample), presentation: next }),
    ).not.toThrow();
  });
});

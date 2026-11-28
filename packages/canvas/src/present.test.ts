import { flowContentSchema, type FlowContent } from '@trama/core';
import { videoFlowExample } from '@trama/core/fixtures';
import { describe, expect, it } from 'vitest';
import {
  stepTag,
  stepTagHolders,
  arrowDimmed,
  arrowVisible,
  boardBounds,
  cameraFor,
  clampStep,
  nodeName,
  presentStates,
  stepBounds,
  stepIndexes,
  stepName,
} from './present';

const flow: FlowContent = flowContentSchema.parse(videoFlowExample);
const byId = (id: string) => {
  const found = [...flow.blocks, ...flow.frames].find((node) => node.id === id);
  if (!found) throw new Error(`Sem o nó ${id} no exemplo.`);
  return found;
};

describe('qual nó aparece em qual passo', () => {
  it('no passo 1: o passo 1 em destaque, os outros ocultos, o resto como fundo', () => {
    const states = presentStates(flow, 0);
    expect(states.get('card-projeto')).toEqual({ kind: 'current', step: 1, own: true });
    expect(states.get('imagem-thumbnail')).toEqual({ kind: 'current', step: 1, own: true });
    expect(states.get('video-final')).toEqual({ kind: 'future', step: 2, placeholder: true });
    // Fora de qualquer passo: aparece sempre.
    expect(states.get('link-brutos')).toEqual({ kind: 'free' });
    expect(states.get('frame-video')).toEqual({ kind: 'free' });
  });

  it('no passo 3: o 1 e o 2 ficam discretos e o 4 continua oculto', () => {
    const states = presentStates(flow, 2);
    expect(states.get('card-projeto')).toEqual({ kind: 'past', step: 1, own: true });
    expect(states.get('texto-roteiro')).toEqual({ kind: 'past', step: 2, own: true });
    expect(states.get('etapas')).toEqual({ kind: 'current', step: 3, own: true });
    expect(states.get('frame-ideias')).toEqual({ kind: 'future', step: 4, placeholder: true });
  });

  it('quem está numa moldura segue o passo dela, mas some em vez de virar quadro tracejado', () => {
    const before = presentStates(flow, 0);
    expect(byId('ideia-erros')).toMatchObject({ frameId: 'frame-ideias' });
    expect(before.get('ideia-erros')).toEqual({ kind: 'future', step: 4, placeholder: false });
    expect(presentStates(flow, 3).get('ideia-erros')).toEqual({
      kind: 'current',
      step: 4,
      own: false,
    });
    expect(presentStates(flow, 3).get('frame-ideias')).toEqual({
      kind: 'current',
      step: 4,
      own: true,
    });
  });

  it('o passo próprio do bloco vale mais que o da moldura', () => {
    const custom: FlowContent = {
      ...flow,
      presentation: [
        { id: 'a', targetIds: ['frame-ideias'] },
        { id: 'b', targetIds: ['ideia-erros'] },
      ],
    };
    const indexes = stepIndexes(custom, custom.presentation);
    expect(indexes.get('ideia-erros')).toEqual({ index: 1, own: true });
    expect(indexes.get('ideia-davinci')).toEqual({ index: 0, own: false });
    expect(presentStates(custom, 0).get('ideia-erros')).toEqual({
      kind: 'future',
      step: 2,
      placeholder: true,
    });
  });

  it('sem passos, tudo é fundo e aparece', () => {
    const states = presentStates({ ...flow, presentation: [] }, 0);
    expect([...states.values()].every((state) => state.kind === 'free')).toBe(true);
  });

  it('a seta só aparece se os dois lados aparecem, e fica discreta se um deles passou', () => {
    const states = presentStates(flow, 1);
    // seta-projeto-video: card-projeto (passo 1, passou) -> video-final (passo 2, agora)
    expect(arrowVisible(states, 'card-projeto', 'video-final')).toBe(true);
    expect(arrowDimmed(states, 'card-projeto', 'video-final')).toBe(true);
    // seta-video-etapas: video-final (agora) -> etapas (passo 3, oculto)
    expect(arrowVisible(states, 'video-final', 'etapas')).toBe(false);
    expect(arrowDimmed(states, 'video-final', 'texto-titulo')).toBe(false);
  });
});

describe('enquadramento', () => {
  it('o passo enquadra o retângulo que une os nós dele', () => {
    const a = byId('card-projeto');
    const b = byId('imagem-thumbnail');
    const bounds = stepBounds(flow, 0);
    expect(bounds).toEqual({
      x: Math.min(a.position.x, b.position.x),
      y: Math.min(a.position.y, b.position.y),
      width:
        Math.max(a.position.x + a.size.width, b.position.x + b.size.width) -
        Math.min(a.position.x, b.position.x),
      height:
        Math.max(a.position.y + a.size.height, b.position.y + b.size.height) -
        Math.min(a.position.y, b.position.y),
    });
  });

  it('passo que é uma moldura enquadra a moldura inteira', () => {
    const frame = byId('frame-ideias');
    expect(stepBounds(flow, 3)).toEqual({ ...frame.position, ...frame.size });
  });

  it('passo que não existe não tem enquadramento; sem passos, vale o quadro todo', () => {
    expect(stepBounds(flow, 9)).toBeNull();
    const all = boardBounds(flow);
    expect(all).not.toBeNull();
    for (const node of [...flow.blocks, ...flow.frames]) {
      expect(node.position.x).toBeGreaterThanOrEqual(all?.x ?? 0);
      expect(node.position.x + node.size.width).toBeLessThanOrEqual(
        (all?.x ?? 0) + (all?.width ?? 0),
      );
    }
    expect(boardBounds({ ...flow, blocks: [], frames: [] })).toBeNull();
  });

  const camera = {
    padding: { top: 100, right: 100, bottom: 100, left: 100 },
    minZoom: 0.1,
    maxZoom: 1.5,
  };

  it('a câmera põe o retângulo no meio da área livre, sem passar da folga', () => {
    const bounds = { x: 1000, y: 500, width: 800, height: 400 };
    const screen = { width: 1440, height: 900 };
    const view = cameraFor(bounds, screen, camera);
    // Cabe em 1240 x 700: o limite é a altura (700 / 400 = 1,75), travada em 1,5.
    expect(view.zoom).toBe(1.5);
    const left = bounds.x * view.zoom + view.x;
    const right = (bounds.x + bounds.width) * view.zoom + view.x;
    const top = bounds.y * view.zoom + view.y;
    const bottom = (bounds.y + bounds.height) * view.zoom + view.y;
    expect(left).toBeGreaterThanOrEqual(100);
    expect(right).toBeLessThanOrEqual(1340);
    expect(top).toBeGreaterThanOrEqual(100);
    expect(bottom).toBeLessThanOrEqual(800);
    // Centrado.
    expect(left - 100).toBeCloseTo(1340 - right);
    expect(top - 100).toBeCloseTo(800 - bottom);
  });

  it('afasta (zoom menor) quando o passo é maior que a tela', () => {
    const view = cameraFor(
      { x: 0, y: 0, width: 4000, height: 2000 },
      { width: 1000, height: 800 },
      camera,
    );
    expect(view.zoom).toBeCloseTo(0.2);
    expect(
      cameraFor({ x: 0, y: 0, width: 1e6, height: 1e6 }, { width: 1000, height: 800 }, camera).zoom,
    ).toBe(0.1);
  });

  it('não quebra com área vazia ou tela minúscula', () => {
    const view = cameraFor({ x: 0, y: 0, width: 0, height: 0 }, { width: 50, height: 50 }, camera);
    expect(Number.isFinite(view.x) && Number.isFinite(view.y) && Number.isFinite(view.zoom)).toBe(
      true,
    );
  });

  it('mantém o passo entre o primeiro e o último', () => {
    expect(clampStep(-1, 4)).toBe(0);
    expect(clampStep(2, 4)).toBe(2);
    expect(clampStep(9, 4)).toBe(3);
    expect(clampStep(1, 0)).toBe(0);
  });
});

describe('nomes dos passos', () => {
  it('o título do passo vale mais que o nome dos nós', () => {
    expect(stepName(flow, { id: 'x', targetIds: ['frame-ideias'], title: 'Próximos vídeos' })).toBe(
      'Próximos vídeos',
    );
  });

  it('sem título, junta o nome dos dois primeiros nós e conta o resto', () => {
    expect(nodeName(flow, 'card-projeto')).toBe('Como editar 10x mais rápido');
    expect(nodeName(flow, 'frame-video')).toBe('Vídeo · Como editar 10x mais rápido');
    const name = stepName(flow, {
      id: 'x',
      targetIds: ['video-final', 'texto-titulo', 'texto-roteiro'],
    });
    expect(name.endsWith('+1')).toBe(true);
    expect(name).toContain(', ');
  });

  it('nó que não existe mais não aparece, e passo sem nó diz isso', () => {
    expect(nodeName(flow, 'nao-existe')).toBeNull();
    expect(stepName(flow, { id: 'x', targetIds: ['nao-existe'] })).toBe('Passo sem blocos');
    expect(stepName(flow, { id: 'x', targetIds: ['nao-existe', 'etapas'] })).toBe('Etapas');
  });

  it('nome longo é cortado com reticências', () => {
    const long: FlowContent = {
      ...flow,
      blocks: flow.blocks.map((block) =>
        block.id === 'card-projeto' && block.type === 'card'
          ? { ...block, title: 'x'.repeat(100) }
          : block,
      ),
    };
    const name = nodeName(long, 'card-projeto') ?? '';
    expect(name).toHaveLength(40);
    expect(name.endsWith('…')).toBe(true);
  });
});

describe('etiqueta do passo', () => {
  it('"Passo N · agora" no de agora, "Passo N" nos que passaram, nada em quem só acompanha', () => {
    expect(stepTag({ kind: 'current', step: 2, own: true })).toBe('Passo 2 · agora');
    expect(stepTag({ kind: 'past', step: 1, own: true })).toBe('Passo 1');
    expect(stepTag({ kind: 'current', step: 2, own: false })).toBeNull();
    expect(stepTag({ kind: 'past', step: 1, own: false })).toBeNull();
    expect(stepTag({ kind: 'free' })).toBeNull();
    expect(stepTag({ kind: 'future', step: 3, placeholder: true })).toBeNull();
  });
});

describe('quem leva a etiqueta do passo', () => {
  it('um nó por passo: o mais alto, e empatado o mais à esquerda', () => {
    const holders = stepTagHolders(flow);
    expect(holders.size).toBe(flow.presentation.length);
    for (const step of flow.presentation) {
      const own = step.targetIds.filter((id) => holders.has(id));
      expect(own).toHaveLength(1);
      const tagged = byId(own[0] ?? '');
      for (const id of step.targetIds) {
        const other = byId(id);
        expect(tagged.position.y).toBeLessThanOrEqual(other.position.y);
      }
    }
  });
});

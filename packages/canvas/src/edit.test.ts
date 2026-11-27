import { flowContentSchema } from '@trama/core';
import { videoFlowExample } from '@trama/core/fixtures';
import { describe, expect, it } from 'vitest';
import { duplicateNodes, groupIntoFrame, History } from './edit';

const flow = flowContentSchema.parse(videoFlowExample);

describe('duplicar (Ctrl+D)', () => {
  it('copia o bloco ao lado, com id novo, na mesma moldura', () => {
    const { flow: next, copies } = duplicateNodes(flow, ['nota-comentario']);
    expect(copies).toHaveLength(1);
    const copy = next.blocks.find((block) => block.id === copies[0]);
    expect(copy).toMatchObject({
      type: 'sticky',
      text: 'Fixar comentário com o link do curso',
      frameId: 'frame-video',
      position: { x: 848, y: 424 },
    });
    expect(() => flowContentSchema.parse(next)).not.toThrow();
  });

  it('copia as setas entre os blocos copiados, e só elas', () => {
    const { flow: next } = duplicateNodes(flow, ['card-projeto', 'video-final']);
    expect(next.arrows).toHaveLength(flow.arrows.length + 1);
    expect(() => flowContentSchema.parse(next)).not.toThrow();
  });

  it('moldura vem com os blocos de dentro, na moldura copiada', () => {
    const { flow: next, copies } = duplicateNodes(flow, ['frame-ideias']);
    const frameCopy = next.frames.find((frame) => copies.includes(frame.id));
    expect(frameCopy?.title).toBe('Ideias · próximos vídeos');
    const inside = next.blocks.filter((block) => block.frameId === frameCopy?.id);
    expect(inside).toHaveLength(5);
    expect(() => flowContentSchema.parse(next)).not.toThrow();
  });

  it('etapas copiadas ganham ids novos e nada muda sem seleção', () => {
    const { flow: next, copies } = duplicateNodes(flow, ['etapas']);
    const copy = next.blocks.find((block) => block.id === copies[0]);
    const original = flow.blocks.find((block) => block.id === 'etapas');
    expect(copy?.type === 'checklist' && original?.type === 'checklist').toBe(true);
    if (copy?.type === 'checklist' && original?.type === 'checklist') {
      expect(copy.items.map((item) => item.text)).toEqual(original.items.map((item) => item.text));
      expect(copy.items[0]?.id).not.toBe(original.items[0]?.id);
    }
    expect(duplicateNodes(flow, []).flow).toBe(flow);
  });
});

describe('agrupar (Ctrl+G)', () => {
  it('cria a moldura em volta dos blocos, na grade, e põe os blocos nela', () => {
    const result = groupIntoFrame(flow, ['ideia-erros', 'ideia-davinci', 'frame-video'], 'g1');
    expect(result).not.toBeNull();
    const next = result?.flow;
    const frame = next?.frames.find((f) => f.id === 'g1');
    // ideia-erros em (1072, 112); ideia-davinci termina em (1320, 216); folga de 32.
    expect(frame).toMatchObject({
      title: 'Nova seção',
      position: { x: 1040, y: 80 },
      size: { width: 312, height: 168 },
    });
    expect(next?.blocks.filter((block) => block.frameId === 'g1')).toHaveLength(2);
    expect(() => flowContentSchema.parse(next)).not.toThrow();
  });

  it('sem blocos na seleção, não agrupa', () => {
    expect(groupIntoFrame(flow, ['frame-video'])).toBeNull();
  });
});

describe('desfazer e refazer', () => {
  it('volta e avança pelas fotos do fluxo', () => {
    const history = new History();
    const a = { ...flow, arrows: [] };
    const b = { ...flow, presentation: [] };
    history.record(flow);
    history.record(a);
    expect(history.undo(b)).toBe(a);
    expect(history.undo(a)).toBe(flow);
    expect(history.undo(flow)).toBeUndefined();
    expect(history.redo(flow)).toBe(a);
    expect(history.redo(a)).toBe(b);
    expect(history.canRedo).toBe(false);
  });

  it('uma mudança nova apaga o que dava para refazer, e o limite vale', () => {
    const history = new History(2);
    history.record(flow);
    history.undo({ ...flow });
    expect(history.canRedo).toBe(true);
    history.record(flow);
    expect(history.canRedo).toBe(false);
    history.record(flow);
    history.record(flow);
    expect(history.undo(flow)).toBe(flow);
    expect(history.undo(flow)).toBe(flow);
    expect(history.canUndo).toBe(false);
  });
});

import { flowContentSchema } from '@trama/core';
import { videoFlowExample } from '@trama/core/fixtures';
import { describe, expect, it } from 'vitest';
import { fromReactFlow, toReactFlow, type CanvasNode } from './convert';

const flow = flowContentSchema.parse(videoFlowExample);

describe('toReactFlow', () => {
  const { nodes, edges } = toReactFlow(flow);

  it('põe as molduras antes dos blocos e atrás deles', () => {
    const firstBlock = nodes.findIndex((node) => node.type === 'block');
    expect(nodes.slice(0, firstBlock).every((node) => node.type === 'frame')).toBe(true);
    const frame = nodes.find((node) => node.id === 'frame-video');
    const block = nodes.find((node) => node.id === 'card-projeto');
    expect(frame?.zIndex).toBeLessThan(block?.zIndex ?? 0);
  });

  it('deixa a posição do bloco relativa à moldura', () => {
    const card = nodes.find((node) => node.id === 'card-projeto');
    // card em (144, 128); moldura em (112, 96)
    expect(card).toMatchObject({ parentId: 'frame-video', position: { x: 32, y: 32 } });
  });

  it('liga as setas pelos lados e pelo tipo de traço', () => {
    expect(edges.find((edge) => edge.id === 'seta-projeto-thumbnail')).toMatchObject({
      source: 'card-projeto',
      target: 'imagem-thumbnail',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      type: 'arrow',
    });
    expect(edges.find((edge) => edge.id === 'seta-projeto-thumbnail')?.data?.arrow.route).toBe(
      'straight',
    );
    expect(edges.find((edge) => edge.id === 'seta-projeto-video')?.data?.arrow.route).toBe(
      'curved',
    );
  });
});

describe('fromReactFlow', () => {
  it('volta ao formato do core sem mudar nada quando nada se moveu', () => {
    const { nodes } = toReactFlow(flow);
    expect(fromReactFlow(flow, nodes)).toEqual(flow);
  });

  it('move o bloco junto com a moldura e encaixa na grade de 8 px', () => {
    const { nodes } = toReactFlow(flow);
    const moved = nodes.map((node): CanvasNode =>
      node.id === 'frame-video' ? { ...node, position: { x: 213, y: 99 } } : node,
    );
    const next = fromReactFlow(flow, moved);
    expect(next.frames.find((frame) => frame.id === 'frame-video')?.position).toEqual({
      x: 216,
      y: 96,
    });
    // card: 213 + 32 = 245 → 248; 99 + 32 = 131 → 128
    expect(next.blocks.find((block) => block.id === 'card-projeto')?.position).toEqual({
      x: 248,
      y: 128,
    });
    expect(flowContentSchema.safeParse(next).success).toBe(true);
  });
});

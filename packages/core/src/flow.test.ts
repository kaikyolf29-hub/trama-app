import { describe, expect, it } from 'vitest';
import { videoFlowExample } from './fixtures';
import { createEmptyFlow, flowContentSchema, type FlowContentInput } from './flow';

const at = { position: { x: 0, y: 0 }, size: { width: 160, height: 80 } };

function flowWith(parts: Partial<FlowContentInput>): FlowContentInput {
  return { schemaVersion: 1, ...parts };
}

function messages(input: unknown): string[] {
  const result = flowContentSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe('flowContentSchema', () => {
  it('aceita o fluxo de vídeo da tela 1', () => {
    const flow = flowContentSchema.parse(videoFlowExample);
    expect(flow.blocks).toHaveLength(12);
    expect(flow.frames).toHaveLength(2);
    expect(flow.arrows).toHaveLength(4);
    expect(flow.presentation).toHaveLength(4);
  });

  it('preenche os valores padrão', () => {
    const flow = flowContentSchema.parse(
      flowWith({
        blocks: [{ id: 'a', type: 'text', ...at }],
        frames: [{ id: 'f', ...at }],
        arrows: [{ id: 's', from: { nodeId: 'a' }, to: { nodeId: 'f' } }],
      }),
    );
    expect(flow.blocks[0]).toMatchObject({
      text: '',
      font: 'sans',
      fontSize: 16,
      color: 'normal',
      bold: false,
      italic: false,
      locked: false,
      zIndex: 0,
    });
    expect(flow.frames[0]).toMatchObject({ title: '', locked: false, zIndex: 0 });
    expect(flow.arrows[0]?.route).toBe('curved');
    expect(flow.presentation).toEqual([]);
  });

  it('sobrevive a ida e volta em JSON', () => {
    const flow = flowContentSchema.parse(videoFlowExample);
    const roundTrip = flowContentSchema.parse(JSON.parse(JSON.stringify(flow)));
    expect(roundTrip).toEqual(flow);
  });

  it('createEmptyFlow é um fluxo válido', () => {
    expect(flowContentSchema.parse(createEmptyFlow())).toEqual(createEmptyFlow());
  });

  it('recusa outra versão do formato', () => {
    expect(flowContentSchema.safeParse({ ...createEmptyFlow(), schemaVersion: 2 }).success).toBe(
      false,
    );
  });

  it('recusa ids repetidos entre blocos, molduras, setas e passos', () => {
    expect(
      messages(
        flowWith({
          blocks: [{ id: 'x', type: 'sticky', ...at }],
          frames: [{ id: 'x', ...at }],
        }),
      ),
    ).toContain('id repetido: x');
  });

  it('recusa bloco dentro de moldura que não existe', () => {
    expect(
      messages(flowWith({ blocks: [{ id: 'a', type: 'sticky', frameId: 'nada', ...at }] })),
    ).toContain('moldura inexistente: nada');
  });

  it('recusa seta para nó que não existe', () => {
    expect(
      messages(
        flowWith({
          blocks: [{ id: 'a', type: 'sticky', ...at }],
          arrows: [{ id: 's', from: { nodeId: 'a' }, to: { nodeId: 'b' } }],
        }),
      ),
    ).toContain('a seta aponta para um nó inexistente: b');
  });

  it('recusa seta que liga um nó a ele mesmo', () => {
    expect(
      messages(
        flowWith({
          blocks: [{ id: 'a', type: 'sticky', ...at }],
          arrows: [{ id: 's', from: { nodeId: 'a' }, to: { nodeId: 'a' } }],
        }),
      ),
    ).toContain('a seta precisa ligar dois nós diferentes');
  });

  it('recusa passo da aula com nó que não existe', () => {
    expect(messages(flowWith({ presentation: [{ id: 'p1', targetIds: ['fantasma'] }] }))).toContain(
      'o passo aponta para um nó inexistente: fantasma',
    );
  });

  it('recusa nó em dois passos da aula', () => {
    expect(
      messages(
        flowWith({
          blocks: [{ id: 'a', type: 'sticky', ...at }],
          presentation: [
            { id: 'p1', targetIds: ['a'] },
            { id: 'p2', targetIds: ['a'] },
          ],
        }),
      ),
    ).toContain('o nó a já está no passo 1');
  });

  it('recusa passo da aula vazio', () => {
    expect(
      flowContentSchema.safeParse(flowWith({ presentation: [{ id: 'p1', targetIds: [] }] }))
        .success,
    ).toBe(false);
  });
});

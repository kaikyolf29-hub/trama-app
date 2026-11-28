import { describe, expect, it } from 'vitest';
import {
  AI_TEXT_MAX,
  aiApiKeySchema,
  aiEffortSchema,
  aiErrorBodySchema,
  aiEstimateResponseSchema,
  aiFlowOutputSchema,
  aiKeyLast4,
  aiKeySummarySchema,
  aiKeysResponseSchema,
  aiModelIdSchema,
  aiOrganizeRequestSchema,
  aiOrganizeResponseSchema,
  aiPromptOutputSchema,
  aiProviderSchema,
  aiSettingsResponseSchema,
  aiSettingsSchema,
  promptOutputToText,
  saveAiKeyRequestSchema,
  type AiFlowOutput,
} from './ai';
import { aiOutputToFlow, aiSuggestedTitle, clipText } from './ai-flow';
import { flowContentSchema } from './flow';
import { snapToGrid } from './geometry';

/** Uma saída típica: um grupo com duas etapas, um texto solto e uma nota fora do grupo. */
function sample(): AiFlowOutput {
  return {
    title: 'Vídeo sobre gatos',
    blocks: [
      { type: 'text', ref: 'b1', text: 'Vídeo sobre gatos', style: 'title', color: 'strong' },
      {
        type: 'card',
        ref: 'b2',
        title: 'Gravar a abertura',
        description: 'Mostrar o gato na janela',
        tag: 'Cena 1',
      },
      { type: 'card', ref: 'b3', title: 'Editar', description: null, tag: null },
      { type: 'sticky', ref: 'b4', text: 'Trocar raposa por gato', color: 'yellow' },
      { type: 'shape', ref: 'b5', shape: 'diamond', text: 'Ficou bom?' },
      { type: 'checklist', ref: 'b6', title: 'Antes de gravar', items: ['Luz', 'Microfone'] },
    ],
    groups: [{ ref: 'g1', title: 'Produção', blockRefs: ['b2', 'b3'] }],
    links: [
      { from: 'b2', to: 'b3', label: 'depois' },
      { from: 'g1', to: 'b5', label: null },
    ],
    corrections: [{ from: 'raposa', to: 'gato' }],
  };
}

function counter() {
  let n = 0;
  return () => `id-${String(++n)}`;
}

describe('IA: preferências e chaves', () => {
  it('conhece os três provedores e os três esforços', () => {
    expect(aiProviderSchema.options).toEqual(['anthropic', 'google', 'openai']);
    expect(aiEffortSchema.options).toEqual(['fast', 'balanced', 'thorough']);
  });

  it('valida a escolha da pessoa', () => {
    const settings = { provider: 'anthropic', model: 'claude-haiku-5-5', effort: 'fast' };
    expect(aiSettingsSchema.parse(settings)).toEqual(settings);
    expect(aiSettingsResponseSchema.parse({ settings: null }).settings).toBeNull();
    expect(aiSettingsSchema.safeParse({ ...settings, provider: 'meta' }).success).toBe(false);
    expect(aiSettingsSchema.safeParse({ ...settings, effort: 'max' }).success).toBe(false);
    expect(aiSettingsSchema.safeParse({ ...settings, model: '' }).success).toBe(false);
  });

  it('aceita nomes de modelo dos provedores e recusa o que não é', () => {
    for (const id of [
      'claude-opus-5-5',
      'gemini-3-pro',
      'models/gemini-3-pro',
      'gpt-5.5',
      'o4:mini',
    ]) {
      expect(aiModelIdSchema.safeParse(id).success, id).toBe(true);
    }
    for (const id of ['', ' ', 'um modelo', '../x', 'a?b=c', '-x']) {
      expect(aiModelIdSchema.safeParse(id).success, id).toBe(false);
    }
  });

  it('a chave é texto visível, sem espaços, e o resumo guarda só o final', () => {
    expect(aiApiKeySchema.parse('  sk-ant-api03-abcdef1234  ')).toBe('sk-ant-api03-abcdef1234');
    for (const key of ['', 'curta', 'tem espaço no meio', 'chaveçacentuada', 'a'.repeat(513)]) {
      expect(aiApiKeySchema.safeParse(key).success, key).toBe(false);
    }
    expect(saveAiKeyRequestSchema.safeParse({ apiKey: 'sk-ant-api03-abcdef1234' }).success).toBe(
      true,
    );
    expect(aiKeyLast4('sk-ant-api03-abcdef1234')).toBe('1234');
  });

  it('o resumo não carrega a chave e a lista segue o contrato', () => {
    const summary = { provider: 'openai', last4: '9f3a', savedAt: '2026-11-28T12:00:00.000Z' };
    expect(aiKeySummarySchema.parse(summary)).toEqual(summary);
    expect(aiKeysResponseSchema.parse({ keys: [summary] }).keys).toHaveLength(1);
    // Um campo a mais (por exemplo, a chave) é descartado pelo esquema.
    const parsed = aiKeySummarySchema.parse({ ...summary, apiKey: 'sk-segredo-1234' });
    expect(Object.keys(parsed).sort()).toEqual(['last4', 'provider', 'savedAt']);
    expect(aiKeySummarySchema.safeParse({ ...summary, last4: '12345' }).success).toBe(false);
  });

  it('o erro da API leva o motivo, quando há', () => {
    expect(
      aiErrorBodySchema.parse({ error: 'A chave foi recusada.', code: 'key_rejected' }),
    ).toEqual({ error: 'A chave foi recusada.', code: 'key_rejected' });
    expect(aiErrorBodySchema.parse({ error: 'Algo deu errado.' }).code).toBeUndefined();
    expect(aiErrorBodySchema.safeParse({ error: 'x', code: 'outro' }).success).toBe(false);
  });
});

describe('IA: pedido de organizar', () => {
  it('limpa as pontas e limita o tamanho do texto', () => {
    expect(aiOrganizeRequestSchema.parse({ text: '  oi  ', format: 'flow' })).toEqual({
      text: 'oi',
      format: 'flow',
    });
    expect(
      aiOrganizeRequestSchema.safeParse({ text: 'a'.repeat(AI_TEXT_MAX), format: 'plan' }).success,
    ).toBe(true);
    expect(
      aiOrganizeRequestSchema.safeParse({ text: 'a'.repeat(AI_TEXT_MAX + 1), format: 'plan' })
        .success,
    ).toBe(false);
    expect(aiOrganizeRequestSchema.safeParse({ text: '   ', format: 'prompt' }).success).toBe(
      false,
    );
  });

  it('só aceita os formatos de agora (o roteiro entra depois)', () => {
    for (const format of ['flow', 'plan', 'prompt']) {
      expect(aiOrganizeRequestSchema.safeParse({ text: 'x', format }).success).toBe(true);
    }
    expect(aiOrganizeRequestSchema.safeParse({ text: 'x', format: 'script' }).success).toBe(false);
  });
});

describe('IA: saída de fluxo e plano', () => {
  it('aceita uma saída completa', () => {
    expect(aiFlowOutputSchema.safeParse(sample()).success).toBe(true);
  });

  it('exige ao menos um bloco e todos os campos (null quando não há)', () => {
    expect(aiFlowOutputSchema.safeParse({ ...sample(), blocks: [] }).success).toBe(false);
    const card = { type: 'card', ref: 'b2', title: 'Sem campos' };
    expect(aiFlowOutputSchema.safeParse({ ...sample(), blocks: [card] }).success).toBe(false);
  });

  it('só aceita cores que são nomes de token', () => {
    const blocks = sample().blocks.map((b) =>
      b.type === 'sticky' ? { ...b, color: '#ff0000' } : b,
    );
    expect(aiFlowOutputSchema.safeParse({ ...sample(), blocks }).success).toBe(false);
    const text = sample().blocks.map((b) => (b.type === 'text' ? { ...b, color: 'red' } : b));
    expect(aiFlowOutputSchema.safeParse({ ...sample(), blocks: text }).success).toBe(false);
  });

  it('recusa nome repetido, ligação e grupo para o que não existe e bloco em dois grupos', () => {
    const base = sample();
    const dup = { ...base, blocks: [...base.blocks, { ...base.blocks[0]! }] };
    expect(aiFlowOutputSchema.safeParse(dup).success).toBe(false);

    const groupClash = { ...base, groups: [{ ref: 'b1', title: 'x', blockRefs: ['b2'] }] };
    expect(aiFlowOutputSchema.safeParse(groupClash).success).toBe(false);

    const badLink = { ...base, links: [{ from: 'b2', to: 'nada', label: null }] };
    expect(aiFlowOutputSchema.safeParse(badLink).success).toBe(false);

    const badGroup = { ...base, groups: [{ ref: 'g1', title: 'x', blockRefs: ['nada'] }] };
    expect(aiFlowOutputSchema.safeParse(badGroup).success).toBe(false);

    const twice = {
      ...base,
      groups: [
        { ref: 'g1', title: 'a', blockRefs: ['b2'] },
        { ref: 'g2', title: 'b', blockRefs: ['b2', 'b3'] },
      ],
    };
    expect(aiFlowOutputSchema.safeParse(twice).success).toBe(false);
  });
});

describe('IA: saída de prompt', () => {
  const prompt = {
    title: 'Roteiro de vídeo',
    sections: [
      { heading: 'Objetivo', content: 'Escrever um roteiro curto.' },
      { heading: 'Contexto', content: 'Canal de gatos, tom leve.' },
    ],
    corrections: [{ from: 'raposa', to: 'gato' }],
  };

  it('valida e vira texto com as seções marcadas', () => {
    const output = aiPromptOutputSchema.parse(prompt);
    expect(promptOutputToText(output)).toBe(
      '## Objetivo\n\nEscrever um roteiro curto.\n\n## Contexto\n\nCanal de gatos, tom leve.',
    );
    expect(aiPromptOutputSchema.safeParse({ ...prompt, sections: [] }).success).toBe(false);
  });
});

describe('IA: resposta de organizar', () => {
  const usage = { inputTokens: 1200, outputTokens: 800 };

  it('a saída do fluxo e a do plano passam pelo esquema de fluxo; a do prompt, pelo dela', () => {
    for (const format of ['flow', 'plan'] as const) {
      const response = aiOrganizeResponseSchema.parse({
        provider: 'anthropic',
        model: 'claude-haiku-5-5',
        usage,
        format,
        output: sample(),
      });
      expect(response.format).toBe(format);
    }
    const prompt = { title: 't', sections: [{ heading: 'a', content: 'b' }], corrections: [] };
    expect(
      aiOrganizeResponseSchema.safeParse({
        provider: 'openai',
        model: 'gpt-5.5',
        usage,
        format: 'prompt',
        output: prompt,
      }).success,
    ).toBe(true);
    // O formato diz qual saída vale: um prompt não passa como fluxo.
    expect(
      aiOrganizeResponseSchema.safeParse({
        provider: 'openai',
        model: 'gpt-5.5',
        usage,
        format: 'flow',
        output: prompt,
      }).success,
    ).toBe(false);
  });

  it('a estimativa tem tokens e custo (ou null quando o preço é desconhecido)', () => {
    const base = {
      provider: 'google',
      model: 'gemini-3-pro',
      inputTokens: 900,
      outputTokens: 1500,
    };
    expect(aiEstimateResponseSchema.parse({ ...base, costUsd: 0.0123 }).costUsd).toBe(0.0123);
    expect(aiEstimateResponseSchema.parse({ ...base, costUsd: null }).costUsd).toBeNull();
    expect(aiEstimateResponseSchema.safeParse({ ...base, costUsd: -1 }).success).toBe(false);
  });
});

describe('IA: da saída para o fluxo', () => {
  it('vira um fluxo válido, com blocos, molduras e setas', () => {
    const flow = aiOutputToFlow(sample(), { newId: counter() });
    expect(flowContentSchema.safeParse(flow).success).toBe(true);
    expect(flow.blocks.map((b) => b.type)).toEqual([
      'text',
      'sticky',
      'shape',
      'checklist',
      'card',
      'card',
    ]);
    expect(flow.frames.map((f) => f.title)).toEqual(['Produção']);
    expect(flow.arrows).toHaveLength(2);
    expect(flow.presentation).toEqual([]);
  });

  it('guarda nomes de token, nunca hex', () => {
    const flow = aiOutputToFlow(sample(), { newId: counter() });
    const colors = flow.blocks.flatMap((b) => ('color' in b ? [b.color] : []));
    expect(colors.sort()).toEqual(['strong', 'yellow']);
    expect(JSON.stringify(flow)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('os blocos do grupo ficam dentro da moldura e apontam para ela', () => {
    const flow = aiOutputToFlow(sample(), { newId: counter() });
    const frame = flow.frames[0]!;
    const inside = flow.blocks.filter((b) => b.frameId === frame.id);
    expect(inside.map((b) => (b.type === 'card' ? b.title : ''))).toEqual([
      'Gravar a abertura',
      'Editar',
    ]);
    for (const block of inside) {
      expect(block.position.x).toBeGreaterThanOrEqual(frame.position.x);
      expect(block.position.y).toBeGreaterThanOrEqual(frame.position.y);
      expect(block.position.x + block.size.width).toBeLessThanOrEqual(
        frame.position.x + frame.size.width,
      );
      expect(block.position.y + block.size.height).toBeLessThanOrEqual(
        frame.position.y + frame.size.height,
      );
    }
    // O que não está em grupo vem antes da moldura.
    const loose = flow.blocks.filter((b) => b.frameId === undefined);
    for (const block of loose) {
      expect(block.position.y + block.size.height).toBeLessThanOrEqual(frame.position.y);
    }
  });

  it('as posições provisórias ficam na grade de 8 px e não se sobrepõem', () => {
    const flow = aiOutputToFlow(sample(), { newId: counter() });
    const boxes = [...flow.blocks, ...flow.frames.filter(() => false)];
    for (const node of [...flow.blocks, ...flow.frames]) {
      for (const value of [node.position.x, node.position.y, node.size.width, node.size.height]) {
        expect(value, node.id).toBe(snapToGrid(value));
      }
    }
    for (const [i, a] of boxes.entries()) {
      for (const b of boxes.slice(i + 1)) {
        const apart =
          a.position.x + a.size.width <= b.position.x ||
          b.position.x + b.size.width <= a.position.x ||
          a.position.y + a.size.height <= b.position.y ||
          b.position.y + b.size.height <= a.position.y;
        expect(apart, `${a.id} x ${b.id}`).toBe(true);
      }
    }
  });

  it('as setas ligam os nós certos, com o texto, e podem sair de uma moldura', () => {
    const flow = aiOutputToFlow(sample(), { newId: counter() });
    const idOf = (title: string) =>
      flow.blocks.find((b) => b.type === 'card' && b.title === title)!.id;
    const [first, second] = flow.arrows;
    expect(first).toMatchObject({
      from: { nodeId: idOf('Gravar a abertura') },
      to: { nodeId: idOf('Editar') },
      label: 'depois',
    });
    expect(second!.from.nodeId).toBe(flow.frames[0]!.id);
    expect(second!.label).toBeUndefined();
  });

  it('descarta ligação de um nó para ele mesmo e as repetidas', () => {
    const output = {
      ...sample(),
      links: [
        { from: 'b2', to: 'b2', label: null },
        { from: 'b2', to: 'b3', label: null },
        { from: 'b2', to: 'b3', label: 'de novo' },
      ],
    };
    expect(aiOutputToFlow(output, { newId: counter() }).arrows).toHaveLength(1);
  });

  it('as etapas entram desmarcadas e as correções não viram bloco', () => {
    const flow = aiOutputToFlow(sample(), { newId: counter() });
    const checklist = flow.blocks.find((b) => b.type === 'checklist');
    expect(checklist?.type === 'checklist' && checklist.items.map((i) => [i.text, i.done])).toEqual(
      [
        ['Luz', false],
        ['Microfone', false],
      ],
    );
    expect(JSON.stringify(flow)).not.toContain('raposa" ');
  });

  it('corta texto maior que o esquema aceita, sem quebrar o fluxo', () => {
    const output = {
      ...sample(),
      blocks: [
        {
          type: 'card' as const,
          ref: 'b1',
          title: 'x'.repeat(500),
          description: null,
          tag: 'y'.repeat(90),
        },
      ],
      groups: [],
      links: [],
    };
    const flow = aiOutputToFlow(output, { newId: counter() });
    const card = flow.blocks[0]!;
    expect(card.type === 'card' && card.title.length).toBe(200);
    expect(card.type === 'card' && card.tag?.length).toBe(40);
  });

  it('muitos blocos sem grupo passam para a linha de baixo', () => {
    const blocks = Array.from({ length: 7 }, (_, i) => ({
      type: 'card' as const,
      ref: `c${String(i)}`,
      title: `Passo ${String(i)}`,
      description: null,
      tag: null,
    }));
    const flow = aiOutputToFlow(
      { ...sample(), blocks, groups: [], links: [] },
      { newId: counter() },
    );
    expect(new Set(flow.blocks.map((b) => b.position.y)).size).toBe(3);
    expect(Math.max(...flow.blocks.map((b) => b.position.x))).toBeLessThan(1100);
  });

  it('gera ids únicos por padrão', () => {
    const flow = aiOutputToFlow(sample());
    expect(flowContentSchema.safeParse(flow).success).toBe(true);
  });

  it('corta o título e nunca parte um emoji ao meio', () => {
    expect(aiSuggestedTitle('  ')).toBe('Sem título');
    expect(aiSuggestedTitle('a'.repeat(300))).toHaveLength(200);
    const clipped = clipText(`${'a'.repeat(8)}\u{1F600}\u{1F600}`, 10);
    expect(clipped).not.toMatch(/[\ud800-\udbff]…$/);
    expect(clipped.length).toBeLessThanOrEqual(10);
  });
});

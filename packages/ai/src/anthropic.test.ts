import { describe, expect, it } from 'vitest';
import { flowPrompt, promptPrompt } from '../prompts';
import { createAnthropicProvider } from './anthropic';
import { AiError } from './errors';
import { at, createFakeFetch, type FakeReply, type RecordedRequest } from './testing';

const KEY = 'sk-ant-chave-de-teste-1234';

function message(text: string, extra: Record<string, unknown> = {}): FakeReply {
  return {
    json: {
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      model: 'claude-haiku-5-5',
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      stop_details: null,
      usage: { input_tokens: 1500, output_tokens: 700 },
      ...extra,
    },
  };
}

function setup(reply: (request: RecordedRequest) => FakeReply) {
  const fake = createFakeFetch(reply);
  const provider = createAnthropicProvider(KEY, { fetch: fake.fetch });
  return { provider, requests: fake.requests };
}

const params = {
  model: 'claude-haiku-5-5',
  effort: 'balanced' as const,
  format: 'flow' as const,
  text: 'Quero um vídeo sobre gatos.',
};

describe('Claude: organizar', () => {
  it('manda o esforço de forma explícita, a chave certa e o esquema em JSON', async () => {
    const { provider, requests } = setup(() => message(JSON.stringify(flowPrompt.example.output)));
    const result = await provider.organize(params);
    expect(result.format).toBe('flow');
    expect(result.usage).toEqual({ inputTokens: 1500, outputTokens: 700 });
    expect(result.output).toEqual(flowPrompt.example.output);

    const request = requests[0]!;
    expect(request.url.pathname).toBe('/v1/messages');
    expect(request.headers.get('authorization')).toBe(`Bearer ${KEY}`);
    const body = request.body;
    expect(at(body, 'model')).toBe('claude-haiku-5-5');
    expect(at(body, 'output_config', 'effort')).toBe('medium');
    expect(at(body, 'output_config', 'format', 'type')).toBe('json_schema');
    expect(at(body, 'output_config', 'format', 'schema', 'type')).toBe('object');
    expect(at(body, 'system')).toBe(flowPrompt.system);
    const sent = at(body, 'messages') as { role: string; content: string }[];
    expect(sent).toHaveLength(1);
    expect(sent[0]?.role).toBe('user');
    expect(sent[0]?.content).toContain('<fala>');
  });

  it.each([
    ['fast', 'low'],
    ['balanced', 'medium'],
    ['thorough', 'high'],
  ] as const)('esforço %s vai como %s', async (effort, expected) => {
    const { provider, requests } = setup(() => message(JSON.stringify(flowPrompt.example.output)));
    await provider.organize({ ...params, effort });
    expect(at(requests[0]!.body, 'output_config', 'effort')).toBe(expected);
  });

  it('não manda thinking, temperature, top_p, top_k nem resposta pré-preenchida', async () => {
    const { provider, requests } = setup(() => message(JSON.stringify(flowPrompt.example.output)));
    await provider.organize(params);
    const body = requests[0]!.body as Record<string, unknown>;
    for (const field of ['thinking', 'temperature', 'top_p', 'top_k']) {
      expect(body, field).not.toHaveProperty(field);
    }
    const messages = at(body, 'messages') as { role: string }[];
    expect(messages.at(-1)?.role).toBe('user');
  });

  it('organiza um prompt', async () => {
    const { provider } = setup(() => message(JSON.stringify(promptPrompt.example.output)));
    const result = await provider.organize({ ...params, format: 'prompt' });
    expect(result.format).toBe('prompt');
    expect(result.output).toEqual(promptPrompt.example.output);
  });

  it('recusa do modelo vira "refused"', async () => {
    const { provider } = setup(() =>
      message('', {
        content: [],
        stop_reason: 'refusal',
        stop_details: { type: 'refusal', category: 'cyber', explanation: null },
      }),
    );
    await expect(provider.organize(params)).rejects.toMatchObject({ code: 'refused' });
  });

  it('resposta cortada vira "truncated"', async () => {
    const { provider } = setup(() => message('{"title":', { stop_reason: 'max_tokens' }));
    await expect(provider.organize(params)).rejects.toMatchObject({ code: 'truncated' });
  });

  it('JSON quebrado e saída fora do contrato viram "bad_output"', async () => {
    const broken = setup(() => message('isto não é JSON'));
    await expect(broken.provider.organize(params)).rejects.toMatchObject({ code: 'bad_output' });

    // A ligação aponta para um bloco que não existe: só o core percebe.
    const wrong = {
      ...flowPrompt.example.output,
      links: [{ from: 'b1', to: 'nada', label: null }],
    };
    const invalid = setup(() => message(JSON.stringify(wrong)));
    await expect(invalid.provider.organize(params)).rejects.toBeInstanceOf(AiError);
    await expect(invalid.provider.organize(params)).rejects.toMatchObject({ code: 'bad_output' });
  });

  it('erros do SDK viram erros do Trama, sem olhar o texto', async () => {
    const cases: [number, string][] = [
      [401, 'key_rejected'],
      [403, 'key_rejected'],
      [429, 'provider_rate_limited'],
      [404, 'provider_error'],
      [400, 'provider_error'],
      [500, 'provider_error'],
    ];
    for (const [status, code] of cases) {
      const { provider } = setup(() => ({
        status,
        // `x-should-retry: false` evita a tentativa extra do SDK.
        headers: { 'x-should-retry': 'false' },
        json: { type: 'error', error: { type: 'qualquer', message: 'texto que não importa' } },
      }));
      await expect(provider.organize(params), String(status)).rejects.toMatchObject({ code });
    }
  });

  it('as mensagens de erro não repetem a chave', async () => {
    const { provider } = setup(() => ({
      status: 401,
      json: { type: 'error', error: { type: 'authentication_error', message: `bad key ${KEY}` } },
    }));
    const error = (await provider.organize(params).catch((e: unknown) => e)) as AiError;
    expect(error.message).not.toContain(KEY);
  });
});

describe('Claude: modelos', () => {
  it('lê a lista da API da conta, sem os modelos aposentados', async () => {
    const { provider, requests } = setup(() => ({
      json: {
        data: [
          {
            type: 'model',
            id: 'claude-opus-5-5',
            display_name: 'Claude Opus 5.5',
            created_at: '2026-10-01T00:00:00Z',
            max_input_tokens: 1_000_000,
            max_tokens: 128_000,
            lifecycle: 'active',
          },
          {
            type: 'model',
            id: 'claude-antigo',
            display_name: 'Antigo',
            created_at: '2025-01-01T00:00:00Z',
            max_input_tokens: 200_000,
            max_tokens: 8000,
            lifecycle: 'retired',
          },
        ],
        has_more: false,
        first_id: 'claude-opus-5-5',
        last_id: 'claude-antigo',
      },
    }));
    expect(await provider.listModels()).toEqual([
      {
        id: 'claude-opus-5-5',
        name: 'Claude Opus 5.5',
        maxInputTokens: 1_000_000,
        maxOutputTokens: 128_000,
      },
    ]);
    expect(requests[0]!.url.pathname).toBe('/v1/models');
  });

  it('chave recusada na lista vira "key_rejected"', async () => {
    const { provider } = setup(() => ({
      status: 401,
      headers: { 'x-should-retry': 'false' },
      json: {
        type: 'error',
        error: { type: 'authentication_error', message: 'invalid x-api-key' },
      },
    }));
    await expect(provider.listModels()).rejects.toMatchObject({ code: 'key_rejected' });
  });
});

describe('Claude: estimativa', () => {
  it('conta os tokens pela API e calcula o custo do modelo', async () => {
    const { provider, requests } = setup(() => ({ json: { input_tokens: 2000 } }));
    const estimate = await provider.estimate({ ...params, model: 'claude-sonnet-5-5' });
    expect(requests[0]!.url.pathname).toBe('/v1/messages/count_tokens');
    expect(estimate.inputTokens).toBe(2000);
    expect(estimate.outputTokens).toBeGreaterThan(0);
    expect(estimate.costUsd).toBeCloseTo((2000 * 2 + estimate.outputTokens * 10) / 1_000_000, 8);
  });

  it('modelo sem preço na tabela dá só os tokens', async () => {
    const { provider } = setup(() => ({ json: { input_tokens: 100 } }));
    expect(
      (await provider.estimate({ ...params, model: 'claude-novo-demais' })).costUsd,
    ).toBeNull();
  });
});

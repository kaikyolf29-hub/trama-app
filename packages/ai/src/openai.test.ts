import { describe, expect, it } from 'vitest';
import { flowPrompt, promptPrompt } from '../prompts';
import { createOpenAiProvider } from './openai';
import { at, createFakeFetch, type FakeReply, type RecordedRequest } from './testing';

const KEY = 'sk-proj-chave-de-teste-1234';

function response(text: string, extra: Record<string, unknown> = {}): FakeReply {
  return {
    json: {
      id: 'resp_1',
      object: 'response',
      created_at: 1_790_000_000,
      status: 'completed',
      model: 'gpt-5',
      incomplete_details: null,
      output: [
        {
          type: 'message',
          id: 'msg_1',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text, annotations: [] }],
        },
      ],
      usage: {
        input_tokens: 1300,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 900,
        output_tokens_details: { reasoning_tokens: 300 },
        total_tokens: 2200,
      },
      ...extra,
    },
  };
}

function setup(reply: (request: RecordedRequest) => FakeReply) {
  const fake = createFakeFetch(reply);
  const provider = createOpenAiProvider(KEY, { fetch: fake.fetch });
  return { provider, requests: fake.requests };
}

const params = {
  model: 'gpt-5',
  effort: 'balanced' as const,
  format: 'flow' as const,
  text: 'Quero um vídeo sobre gatos.',
};

describe('ChatGPT: organizar', () => {
  it('manda o esforço de raciocínio, o esquema estrito e não guarda o texto na OpenAI', async () => {
    const { provider, requests } = setup(() => response(JSON.stringify(flowPrompt.example.output)));
    const result = await provider.organize(params);
    expect(result.output).toEqual(flowPrompt.example.output);
    expect(result.usage).toEqual({ inputTokens: 1300, outputTokens: 900 });

    const request = requests[0]!;
    expect(request.url.pathname).toBe('/v1/responses');
    expect(request.headers.get('authorization')).toBe(`Bearer ${KEY}`);
    const body = request.body;
    expect(at(body, 'model')).toBe('gpt-5');
    expect(at(body, 'reasoning')).toEqual({ effort: 'medium' });
    expect(at(body, 'store')).toBe(false);
    expect(at(body, 'instructions')).toBe(flowPrompt.system);
    expect(at(body, 'input')).toContain('<fala>');
    expect(at(body, 'text', 'format', 'type')).toBe('json_schema');
    expect(at(body, 'text', 'format', 'strict')).toBe(true);
    expect(at(body, 'text', 'format', 'schema', 'type')).toBe('object');
    expect(JSON.stringify(at(body, 'text', 'format', 'schema'))).not.toContain('oneOf');
  });

  it.each([
    ['fast', 'low'],
    ['balanced', 'medium'],
    ['thorough', 'high'],
  ] as const)('esforço %s vai como %s', async (effort, expected) => {
    const { provider, requests } = setup(() => response(JSON.stringify(flowPrompt.example.output)));
    await provider.organize({ ...params, effort });
    expect(at(requests[0]!.body, 'reasoning', 'effort')).toBe(expected);
  });

  it('modelo sem raciocínio não recebe o parâmetro', async () => {
    const { provider, requests } = setup(() => response(JSON.stringify(flowPrompt.example.output)));
    await provider.organize({ ...params, model: 'gpt-4o' });
    expect(requests[0]!.body).not.toHaveProperty('reasoning');
  });

  it('organiza um prompt', async () => {
    const { provider } = setup(() => response(JSON.stringify(promptPrompt.example.output)));
    const result = await provider.organize({ ...params, format: 'prompt' });
    expect(result.output).toEqual(promptPrompt.example.output);
  });

  it('recusa, resposta cortada, filtro e JSON ruim viram erros claros', async () => {
    const refusal = setup(() =>
      response('', {
        output: [
          {
            type: 'message',
            id: 'msg_1',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'refusal', refusal: 'Não posso ajudar.' }],
          },
        ],
      }),
    );
    await expect(refusal.provider.organize(params)).rejects.toMatchObject({ code: 'refused' });

    const cut = setup(() =>
      response('{"title"', {
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
      }),
    );
    await expect(cut.provider.organize(params)).rejects.toMatchObject({ code: 'truncated' });

    const filtered = setup(() =>
      response('', { status: 'incomplete', incomplete_details: { reason: 'content_filter' } }),
    );
    await expect(filtered.provider.organize(params)).rejects.toMatchObject({ code: 'refused' });

    const broken = setup(() => response('não é JSON'));
    await expect(broken.provider.organize(params)).rejects.toMatchObject({ code: 'bad_output' });

    const wrong = setup(() => response(JSON.stringify({ title: 'x' })));
    await expect(wrong.provider.organize(params)).rejects.toMatchObject({ code: 'bad_output' });
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
        headers: { 'x-should-retry': 'false' },
        json: { error: { message: `qualquer ${KEY}`, type: 'x', code: 'y' } },
      }));
      const error = await provider.organize(params).catch((e: unknown) => e);
      expect(error, String(status)).toMatchObject({ code });
      expect((error as Error).message).not.toContain(KEY);
    }
  });
});

describe('ChatGPT: modelos e estimativa', () => {
  it('lista só os modelos de conversa, os mais novos primeiro', async () => {
    const model = (id: string, created: number) => ({
      id,
      object: 'model',
      created,
      owned_by: 'openai',
    });
    const { provider } = setup(() => ({
      json: {
        object: 'list',
        data: [
          model('gpt-4o', 100),
          model('gpt-5', 300),
          model('text-embedding-3-small', 400),
          model('gpt-4o-audio-preview', 500),
          model('whisper-1', 50),
          model('o4-mini', 200),
          model('dall-e-3', 10),
        ],
      },
    }));
    expect((await provider.listModels()).map((m) => m.id)).toEqual(['gpt-5', 'o4-mini', 'gpt-4o']);
  });

  it('chave recusada na lista vira "key_rejected"', async () => {
    const { provider } = setup(() => ({
      status: 401,
      headers: { 'x-should-retry': 'false' },
      json: { error: { message: 'Incorrect API key', type: 'invalid_request_error' } },
    }));
    await expect(provider.listModels()).rejects.toMatchObject({ code: 'key_rejected' });
  });

  it('conta os tokens pela API; sem preço conhecido, só os tokens', async () => {
    const { provider, requests } = setup(() => ({
      json: { object: 'response.input_tokens', input_tokens: 1800 },
    }));
    const estimate = await provider.estimate(params);
    expect(requests[0]!.url.pathname).toBe('/v1/responses/input_tokens');
    expect(estimate.inputTokens).toBe(1800);
    expect(estimate.costUsd).toBeNull();
  });
});

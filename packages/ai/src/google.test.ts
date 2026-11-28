import { describe, expect, it } from 'vitest';
import { flowPrompt, promptPrompt } from '../prompts';
import { createGoogleProvider } from './google';
import { at, createFakeFetch, type FakeReply, type RecordedRequest } from './testing';

const KEY = 'AIza-chave-de-teste-1234';

function answer(text: string, extra: Record<string, unknown> = {}): FakeReply {
  return {
    json: {
      candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 1400, candidatesTokenCount: 600, thoughtsTokenCount: 200 },
      ...extra,
    },
  };
}

function setup(reply: (request: RecordedRequest) => FakeReply) {
  const fake = createFakeFetch(reply);
  const provider = createGoogleProvider(KEY, { fetch: fake.fetch });
  return { provider, requests: fake.requests };
}

const params = {
  model: 'gemini-3-pro',
  effort: 'balanced' as const,
  format: 'flow' as const,
  text: 'Quero um vídeo sobre gatos.',
};

describe('Gemini: organizar', () => {
  it('pede JSON com o esquema do core e o nível de raciocínio, e conta o raciocínio como saída', async () => {
    const { provider, requests } = setup(() => answer(JSON.stringify(flowPrompt.example.output)));
    const result = await provider.organize(params);
    expect(result.output).toEqual(flowPrompt.example.output);
    expect(result.usage).toEqual({ inputTokens: 1400, outputTokens: 800 });

    const request = requests[0]!;
    expect(request.url.pathname).toMatch(/\/models\/gemini-3-pro:generateContent$/);
    expect(request.headers.get('x-goog-api-key')).toBe(KEY);
    const body = request.body;
    expect(at(body, 'generationConfig', 'responseMimeType')).toBe('application/json');
    expect(at(body, 'generationConfig', 'responseJsonSchema', 'type')).toBe('object');
    expect(JSON.stringify(at(body, 'generationConfig', 'responseJsonSchema'))).not.toContain(
      'oneOf',
    );
    expect(at(body, 'generationConfig', 'thinkingConfig')).toEqual({ thinkingLevel: 'MEDIUM' });
    expect(at(body, 'systemInstruction', 'parts', '0', 'text')).toBe(flowPrompt.system);
    expect(JSON.stringify(at(body, 'contents'))).toContain('<fala>');
  });

  it.each([
    ['fast', 'LOW'],
    ['balanced', 'MEDIUM'],
    ['thorough', 'HIGH'],
  ] as const)('esforço %s vira o nível %s', async (effort, level) => {
    const { provider, requests } = setup(() => answer(JSON.stringify(flowPrompt.example.output)));
    await provider.organize({ ...params, effort });
    expect(at(requests[0]!.body, 'generationConfig', 'thinkingConfig', 'thinkingLevel')).toBe(
      level,
    );
  });

  it('o Gemini 2.5 usa orçamento de raciocínio, não nível', async () => {
    const { provider, requests } = setup(() => answer(JSON.stringify(flowPrompt.example.output)));
    await provider.organize({ ...params, model: 'gemini-2.5-pro', effort: 'thorough' });
    expect(at(requests[0]!.body, 'generationConfig', 'thinkingConfig')).toEqual({
      thinkingBudget: 16384,
    });
  });

  it('organiza um prompt', async () => {
    const { provider } = setup(() => answer(JSON.stringify(promptPrompt.example.output)));
    const result = await provider.organize({ ...params, format: 'prompt' });
    expect(result.output).toEqual(promptPrompt.example.output);
  });

  it('bloqueio, recusa, corte e JSON ruim viram erros claros', async () => {
    const blocked = setup(() => ({ json: { promptFeedback: { blockReason: 'SAFETY' } } }));
    await expect(blocked.provider.organize(params)).rejects.toMatchObject({ code: 'refused' });

    const safety = setup(() =>
      answer('', { candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] }),
    );
    await expect(safety.provider.organize(params)).rejects.toMatchObject({ code: 'refused' });

    const cut = setup(() =>
      answer('{"title"', {
        candidates: [
          { finishReason: 'MAX_TOKENS', content: { role: 'model', parts: [{ text: '{"title"' }] } },
        ],
      }),
    );
    await expect(cut.provider.organize(params)).rejects.toMatchObject({ code: 'truncated' });

    const broken = setup(() => answer('não é JSON'));
    await expect(broken.provider.organize(params)).rejects.toMatchObject({ code: 'bad_output' });

    const wrong = setup(() => answer(JSON.stringify({ title: 'x' })));
    await expect(wrong.provider.organize(params)).rejects.toMatchObject({ code: 'bad_output' });
  });

  it('erros HTTP viram erros do Trama', async () => {
    const cases: [number, string][] = [
      [401, 'key_rejected'],
      [403, 'key_rejected'],
      [429, 'provider_rate_limited'],
      [400, 'provider_error'],
      [500, 'provider_error'],
    ];
    for (const [status, code] of cases) {
      const { provider } = setup(() => ({
        status,
        json: { error: { code: status, message: 'qualquer', status: 'X' } },
      }));
      await expect(provider.organize(params), String(status)).rejects.toMatchObject({ code });
    }
  });
});

describe('Gemini: modelos e estimativa', () => {
  it('lista só os modelos que geram texto, com o nome sem "models/"', async () => {
    const { provider, requests } = setup(() => ({
      json: {
        models: [
          {
            name: 'models/gemini-3-pro',
            displayName: 'Gemini 3 Pro',
            inputTokenLimit: 1_000_000,
            outputTokenLimit: 65_536,
            supportedGenerationMethods: ['generateContent', 'countTokens'],
          },
          {
            name: 'models/text-embedding-9',
            displayName: 'Embedding',
            supportedGenerationMethods: ['embedContent'],
          },
          {
            name: 'models/gemini-3-pro-image',
            displayName: 'Imagem',
            supportedGenerationMethods: ['generateContent'],
          },
        ],
      },
    }));
    expect(await provider.listModels()).toEqual([
      {
        id: 'gemini-3-pro',
        name: 'Gemini 3 Pro',
        maxInputTokens: 1_000_000,
        maxOutputTokens: 65_536,
      },
    ]);
    expect(requests[0]!.url.pathname).toMatch(/\/models$/);
  });

  it('na lista, o erro 400 do Gemini (chave inválida) vale como chave recusada', async () => {
    const { provider } = setup(() => ({
      status: 400,
      json: { error: { code: 400, message: 'API key not valid.', status: 'INVALID_ARGUMENT' } },
    }));
    await expect(provider.listModels()).rejects.toMatchObject({ code: 'key_rejected' });
  });

  it('conta os tokens pela API; sem preço conhecido, só os tokens', async () => {
    const { provider, requests } = setup(() => ({ json: { totalTokens: 2500 } }));
    const estimate = await provider.estimate(params);
    expect(requests[0]!.url.pathname).toMatch(/\/models\/gemini-3-pro:countTokens$/);
    expect(estimate.inputTokens).toBe(2500);
    expect(estimate.costUsd).toBeNull();
  });
});

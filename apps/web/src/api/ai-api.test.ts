import { describe, expect, it, vi } from 'vitest';
import { createAiApi } from './ai-api';

function api(response: Response | Error) {
  const fetcher = vi.fn<typeof fetch>(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  return {
    fetcher,
    client: createAiApi({
      baseUrl: 'http://api.exemplo/',
      getToken: () => Promise.resolve('tok'),
      fetch: fetcher,
    }),
  };
}

const summary = { provider: 'anthropic', last4: '1234', savedAt: '2026-11-28T12:00:00.000Z' };

describe('API de IA no site', () => {
  it('lê as preferências, que podem ainda não existir', async () => {
    const empty = api(Response.json({ settings: null }));
    expect(await empty.client.getSettings()).toBeNull();
    const [url] = empty.fetcher.mock.calls[0] ?? [];
    expect(url).toBe('http://api.exemplo/ai/settings');

    const settings = { provider: 'openai', model: 'gpt-5', effort: 'fast' };
    expect(await api(Response.json({ settings })).client.getSettings()).toEqual(settings);
  });

  it('guarda as preferências com PUT', async () => {
    const settings = { provider: 'google', model: 'gemini-3-pro', effort: 'thorough' } as const;
    const { client, fetcher } = api(Response.json(settings));
    expect(await client.saveSettings(settings)).toEqual(settings);
    const [, init] = fetcher.mock.calls[0] ?? [];
    expect(init?.method).toBe('PUT');
    expect(init?.body).toBe(JSON.stringify(settings));
  });

  it('manda a chave no PUT e só recebe o resumo de volta', async () => {
    const { client, fetcher } = api(Response.json(summary));
    expect(await client.saveKey('anthropic', 'sk-ant-segredo-1234')).toEqual(summary);
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe('http://api.exemplo/ai/keys/anthropic');
    expect(init?.method).toBe('PUT');
    expect(init?.body).toBe(JSON.stringify({ apiKey: 'sk-ant-segredo-1234' }));
  });

  it('o resumo da lista de chaves descarta qualquer campo a mais (a chave nunca passa)', async () => {
    const { client } = api(
      Response.json({ keys: [{ ...summary, apiKey: 'sk-ant-segredo-1234' }] }),
    );
    const keys = await client.listKeys();
    expect(JSON.stringify(keys)).not.toContain('segredo');
    expect(keys).toEqual([summary]);
  });

  it('apaga a chave (resposta sem corpo) e lê a lista de modelos', async () => {
    const del = api(new Response(null, { status: 204 }));
    await expect(del.client.deleteKey('openai')).resolves.toBeUndefined();
    expect(del.fetcher.mock.calls[0]?.[1]?.method).toBe('DELETE');

    const models = [{ id: 'gpt-5', name: 'gpt-5', maxInputTokens: null, maxOutputTokens: null }];
    const list = api(Response.json({ models }));
    expect(await list.client.listModels('openai')).toEqual(models);
    expect(list.fetcher.mock.calls[0]?.[0]).toBe('http://api.exemplo/ai/models/openai');
  });

  it('o erro leva a frase da API e o motivo', async () => {
    const { client } = api(
      Response.json({ error: 'O Claude recusou a chave.', code: 'key_rejected' }, { status: 422 }),
    );
    await expect(client.saveKey('anthropic', 'sk-ant-xxxxxxxx')).rejects.toMatchObject({
      message: 'O Claude recusou a chave.',
      status: 422,
      code: 'key_rejected',
    });
  });

  it('organiza e estima com o corpo do contrato', async () => {
    const estimate = {
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
      inputTokens: 10,
      outputTokens: 20,
      costUsd: null,
    };
    const est = api(Response.json(estimate));
    expect(await est.client.estimate({ text: 'oi', format: 'flow' })).toEqual(estimate);
    expect(est.fetcher.mock.calls[0]?.[0]).toBe('http://api.exemplo/ai/estimate');

    const bad = api(Response.json({ provider: 'anthropic' }));
    await expect(bad.client.organize({ text: 'oi', format: 'prompt' })).rejects.toMatchObject({
      status: 502,
    });
  });
});

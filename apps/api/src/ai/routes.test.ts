import { AiError } from '@trama/ai';
import { createFakeProvider } from '@trama/ai/testing';
import {
  aiEstimateResponseSchema,
  aiKeySummarySchema,
  aiKeysResponseSchema,
  aiModelsResponseSchema,
  aiOrganizeResponseSchema,
  aiOutputToFlow,
  aiSettingsResponseSchema,
  type AiProvider as AiProviderId,
} from '@trama/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Identity } from '../account/identity';
import { createVault } from '../drive/vault';
import type { Env } from '../env';
import { createApp } from '../index';
import { createMemoryStore } from '../projects/memory-store';
import { createMemoryAiStore } from './memory-store';
import { ORGANIZE_PER_MINUTE, OTHER_PER_MINUTE } from './routes';

const MASTER_KEY = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i + 1)));
const ANA: Identity = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'ana@x.com',
  name: 'Ana',
};
const BIA: Identity = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'bia@x.com',
  name: 'Bia',
};
const tokenOf = (who: Identity) =>
  `cabecalho.${btoa(JSON.stringify({ sub: who.id })).replaceAll('=', '')}.assinatura`;

const ENV: Env = {
  SUPABASE_URL: 'https://supabase.test',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
  TOKEN_ENCRYPTION_KEY: MASTER_KEY,
};

const SECRET = 'sk-ant-segredo-da-ana-0042';

type Made = { provider: AiProviderId; apiKey: string };

function setup(options: { env?: Env; provider?: ReturnType<typeof createFakeProvider> } = {}) {
  const clock = { now: new Date('2026-11-28T12:00:00.000Z') };
  const stores = new Map<string, ReturnType<typeof createMemoryAiStore>>();
  const storeOf = (token: string) => {
    let store = stores.get(token);
    if (!store) {
      store = createMemoryAiStore(() => clock.now);
      stores.set(token, store);
    }
    return store;
  };
  const made: Made[] = [];
  const fake = options.provider ?? createFakeProvider();
  const app = createApp(() => createMemoryStore(), {
    ai: (_env, token) => storeOf(token),
    aiProvider: (provider, apiKey) => {
      made.push({ provider, apiKey });
      return fake;
    },
    vault: (env) =>
      env.TOKEN_ENCRYPTION_KEY ? createVault(env.TOKEN_ENCRYPTION_KEY) : Promise.resolve(null),
    now: () => clock.now,
  });
  const env = options.env ?? ENV;
  const call = (path: string, init: RequestInit & { as?: Identity | null } = {}) => {
    const { as = ANA, ...rest } = init;
    return app.request(
      path,
      {
        ...rest,
        headers: {
          ...(as ? { Authorization: `Bearer ${tokenOf(as)}` } : {}),
          'Content-Type': 'application/json',
          ...rest.headers,
        },
      },
      env,
    );
  };
  const send = (method: string, path: string, body?: unknown, as: Identity | null = ANA) =>
    call(path, { method, as, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const saveKey = (provider: AiProviderId = 'anthropic', apiKey = SECRET, as: Identity = ANA) =>
    send('PUT', `/ai/keys/${provider}`, { apiKey }, as);
  const choose = (provider: AiProviderId = 'anthropic', as: Identity = ANA) =>
    send('PUT', '/ai/settings', { provider, model: 'claude-haiku-5-5', effort: 'fast' }, as);
  return { app, call, send, saveKey, choose, storeOf, stores, made, fake, clock };
}

afterEach(() => vi.restoreAllMocks());

describe('API de IA: login e preferências', () => {
  it('toda rota exige o token de login', async () => {
    const { send } = setup();
    for (const [method, path] of [
      ['GET', '/ai/settings'],
      ['PUT', '/ai/settings'],
      ['GET', '/ai/keys'],
      ['PUT', '/ai/keys/anthropic'],
      ['DELETE', '/ai/keys/anthropic'],
      ['GET', '/ai/models/anthropic'],
      ['POST', '/ai/estimate'],
      ['POST', '/ai/organize'],
    ] as const) {
      const response = await send(
        method,
        path,
        method === 'GET' || method === 'DELETE' ? undefined : {},
        null,
      );
      expect(response.status, `${method} ${path}`).toBe(401);
    }
  });

  it('lê e salva provedor, modelo e esforço', async () => {
    const { send } = setup();
    const first = aiSettingsResponseSchema.parse(await (await send('GET', '/ai/settings')).json());
    expect(first.settings).toBeNull();

    const saved = await send('PUT', '/ai/settings', {
      provider: 'google',
      model: 'gemini-3-pro',
      effort: 'thorough',
    });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({
      provider: 'google',
      model: 'gemini-3-pro',
      effort: 'thorough',
    });
    const again = aiSettingsResponseSchema.parse(await (await send('GET', '/ai/settings')).json());
    expect(again.settings).toEqual({
      provider: 'google',
      model: 'gemini-3-pro',
      effort: 'thorough',
    });
  });

  it('recusa preferências inválidas e cada pessoa vê só as suas', async () => {
    const { send, choose } = setup();
    for (const body of [
      {},
      { provider: 'meta', model: 'x', effort: 'fast' },
      { provider: 'openai', model: '', effort: 'fast' },
      { provider: 'openai', model: 'gpt-5', effort: 'max' },
    ]) {
      expect((await send('PUT', '/ai/settings', body)).status).toBe(400);
    }
    await choose('anthropic', ANA);
    const bia = aiSettingsResponseSchema.parse(
      await (await send('GET', '/ai/settings', undefined, BIA)).json(),
    );
    expect(bia.settings).toBeNull();
  });
});

describe('API de IA: chaves', () => {
  it('testa a chave com o provedor, guarda cifrada e devolve só o resumo', async () => {
    const { saveKey, storeOf, made, fake, clock } = setup();
    const response = await saveKey();
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain(SECRET);
    const summary = aiKeySummarySchema.parse(JSON.parse(text));
    expect(summary).toEqual({
      provider: 'anthropic',
      last4: '0042',
      savedAt: clock.now.toISOString(),
    });
    // Testou com a chave de verdade, pela lista de modelos.
    expect(made).toEqual([{ provider: 'anthropic', apiKey: SECRET }]);
    expect(fake.calls.list).toBe(1);

    // No banco, só o texto cifrado, preso à pessoa e ao provedor.
    const stored = [...storeOf(tokenOf(ANA)).keys.values()][0]!;
    expect(stored.keyEncrypted).toMatch(/^v1\./);
    expect(JSON.stringify(stored)).not.toContain(SECRET);
    const vault = await createVault(MASTER_KEY);
    expect(await vault.decrypt(stored.keyEncrypted, `ai-key:${ANA.id}:anthropic`)).toBe(SECRET);
    await expect(
      vault.decrypt(stored.keyEncrypted, `ai-key:${BIA.id}:anthropic`),
    ).rejects.toThrow();
    await expect(vault.decrypt(stored.keyEncrypted, `ai-key:${ANA.id}:openai`)).rejects.toThrow();
  });

  it('chave recusada pelo provedor não é guardada', async () => {
    const fake = createFakeProvider({
      fail: new AiError('key_rejected', 'O Claude recusou a chave. Confira.'),
    });
    const { saveKey, storeOf } = setup({ provider: fake });
    const response = await saveKey();
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: 'O Claude recusou a chave. Confira.',
      code: 'key_rejected',
    });
    expect(storeOf(tokenOf(ANA)).keys.size).toBe(0);
  });

  it('chave em formato impossível, provedor desconhecido e corpo vazio', async () => {
    const { send, made } = setup();
    expect((await send('PUT', '/ai/keys/anthropic', { apiKey: 'com espaço no meio' })).status).toBe(
      400,
    );
    expect((await send('PUT', '/ai/keys/anthropic', { apiKey: 'curta' })).status).toBe(400);
    expect((await send('PUT', '/ai/keys/anthropic', {})).status).toBe(400);
    expect((await send('PUT', '/ai/keys/meta', { apiKey: SECRET })).status).toBe(404);
    expect((await send('DELETE', '/ai/keys/meta')).status).toBe(404);
    expect(made).toEqual([]);
  });

  it('sem a chave de criptografia da API, a IA fica desligada (503)', async () => {
    const { saveKey, send } = setup({ env: { ...ENV, TOKEN_ENCRYPTION_KEY: undefined } });
    const response = await saveKey();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'not_configured' });
    expect((await send('GET', '/ai/models/anthropic')).status).toBe(503);
  });

  it('lista só o resumo, troca a chave e apaga', async () => {
    const { saveKey, send } = setup();
    await saveKey('anthropic', SECRET);
    await saveKey('openai', 'sk-proj-outra-chave-9f3a');
    const listed = await send('GET', '/ai/keys');
    const text = await listed.text();
    expect(text).not.toContain('segredo');
    expect(text).not.toContain('outra-chave');
    expect(text).not.toMatch(/key_encrypted|keyEncrypted|apiKey/);
    const { keys } = aiKeysResponseSchema.parse(JSON.parse(text));
    expect(keys.map((k) => [k.provider, k.last4]).sort()).toEqual([
      ['anthropic', '0042'],
      ['openai', '9f3a'],
    ]);

    // Trocar: continua uma chave por provedor, com os 4 últimos novos.
    await saveKey('anthropic', 'sk-ant-chave-nova-7777');
    const after = aiKeysResponseSchema.parse(await (await send('GET', '/ai/keys')).json());
    expect(after.keys).toHaveLength(2);
    expect(after.keys.find((k) => k.provider === 'anthropic')?.last4).toBe('7777');

    const removed = await send('DELETE', '/ai/keys/anthropic');
    expect(removed.status).toBe(204);
    const last = aiKeysResponseSchema.parse(await (await send('GET', '/ai/keys')).json());
    expect(last.keys.map((k) => k.provider)).toEqual(['openai']);
  });

  it('a chave de uma pessoa não aparece para outra', async () => {
    const { saveKey, send } = setup();
    await saveKey();
    const bia = aiKeysResponseSchema.parse(
      await (await send('GET', '/ai/keys', undefined, BIA)).json(),
    );
    expect(bia.keys).toEqual([]);
    const models = await send('GET', '/ai/models/anthropic', undefined, BIA);
    expect(models.status).toBe(409);
    expect(await models.json()).toMatchObject({ code: 'no_key' });
  });

  it('linha copiada para outra conta não abre (dado associado)', async () => {
    const { saveKey, storeOf, send } = setup();
    await saveKey();
    // Alguém copia a linha cifrada da Ana para a conta da Bia.
    const copied = [...storeOf(tokenOf(ANA)).keys.values()][0]!;
    await storeOf(tokenOf(BIA)).saveKey({
      provider: 'anthropic',
      keyEncrypted: copied.keyEncrypted,
      last4: copied.last4,
    });
    const response = await send('GET', '/ai/models/anthropic', undefined, BIA);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'no_key' });
  });

  it('a chave não vai para o log, nem em erro', async () => {
    const logs = [
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      vi.spyOn(console, 'info').mockImplementation(() => undefined),
    ];
    const { saveKey, choose, send } = setup({
      provider: createFakeProvider({
        organize: () => {
          throw new Error(`falha com a chave ${SECRET}`);
        },
      }),
    });
    await saveKey();
    await choose();
    await send('POST', '/ai/organize', { text: 'oi', format: 'flow' });
    for (const spy of logs) expect(JSON.stringify(spy.mock.calls)).not.toContain(SECRET);
  });
});

describe('API de IA: modelos e estimativa', () => {
  it('lista os modelos do provedor com a chave da pessoa', async () => {
    const { saveKey, send, made } = setup();
    await saveKey();
    made.length = 0;
    const response = await send('GET', '/ai/models/anthropic');
    expect(response.status).toBe(200);
    const { models } = aiModelsResponseSchema.parse(await response.json());
    expect(models.map((m) => m.id)).toEqual(['modelo-a', 'modelo-b']);
    expect(made).toEqual([{ provider: 'anthropic', apiKey: SECRET }]);
  });

  it('sem chave guardada, avisa (409 no_key)', async () => {
    const { send } = setup();
    const response = await send('GET', '/ai/models/openai');
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'no_key' });
  });

  it('estima tokens e custo com o provedor e o modelo escolhidos', async () => {
    const { saveKey, choose, send, fake } = setup();
    await saveKey();
    await choose();
    const response = await send('POST', '/ai/estimate', { text: 'Uma fala.', format: 'plan' });
    expect(response.status).toBe(200);
    expect(aiEstimateResponseSchema.parse(await response.json())).toEqual({
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
      inputTokens: 900,
      outputTokens: 1500,
      costUsd: 0.0123,
    });
    expect(fake.calls.estimate).toEqual([
      { model: 'claude-haiku-5-5', effort: 'fast', format: 'plan', text: 'Uma fala.' },
    ]);
  });
});

describe('API de IA: organizar', () => {
  it('sem preferências ou sem chave, explica o que falta', async () => {
    const { send, choose, saveKey } = setup();
    const body = { text: 'Uma fala.', format: 'flow' };
    const noSettings = await send('POST', '/ai/organize', body);
    expect(noSettings.status).toBe(409);
    expect(await noSettings.json()).toMatchObject({ code: 'no_settings' });
    await choose();
    const noKey = await send('POST', '/ai/organize', body);
    expect(noKey.status).toBe(409);
    expect(await noKey.json()).toMatchObject({ code: 'no_key' });
    await saveKey();
    expect((await send('POST', '/ai/organize', body)).status).toBe(200);
  });

  it('organiza com as preferências salvas e devolve a saída validada pelo core', async () => {
    const { saveKey, choose, send, fake, made } = setup();
    await saveKey();
    await choose();
    made.length = 0;
    const response = await send('POST', '/ai/organize', {
      text: '  Quero um vídeo sobre gatos.  ',
      format: 'flow',
    });
    expect(response.status).toBe(200);
    const result = aiOrganizeResponseSchema.parse(await response.json());
    expect(result).toMatchObject({
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
      format: 'flow',
      usage: { inputTokens: 1200, outputTokens: 800 },
    });
    // O texto (sem as pontas) e as preferências chegam ao provedor; a chave é a decifrada.
    expect(fake.calls.organize).toEqual([
      {
        model: 'claude-haiku-5-5',
        effort: 'fast',
        format: 'flow',
        text: 'Quero um vídeo sobre gatos.',
      },
    ]);
    expect(made).toEqual([{ provider: 'anthropic', apiKey: SECRET }]);
    // E o que volta vira um fluxo que o quadro abre.
    if (result.format !== 'prompt') {
      expect(aiOutputToFlow(result.output).blocks.length).toBeGreaterThan(0);
    }
  });

  it('organiza um prompt', async () => {
    const { saveKey, choose, send } = setup();
    await saveKey();
    await choose();
    const response = await send('POST', '/ai/organize', { text: 'um prompt', format: 'prompt' });
    expect(aiOrganizeResponseSchema.parse(await response.json()).format).toBe('prompt');
  });

  it('recusa pedido sem texto, grande demais ou com formato desconhecido', async () => {
    const { saveKey, choose, send, call, fake } = setup();
    await saveKey();
    await choose();
    for (const body of [
      {},
      { text: '   ', format: 'flow' },
      { text: 'a'.repeat(20_001), format: 'flow' },
      { text: 'x', format: 'script' },
    ]) {
      expect((await send('POST', '/ai/organize', body)).status).toBe(400);
    }
    expect((await call('/ai/organize', { method: 'POST', body: 'não é json' })).status).toBe(400);
    // Um corpo enorme nem chega a ser lido.
    const huge = await send('POST', '/ai/organize', { text: 'a'.repeat(200_000), format: 'flow' });
    expect(huge.status).toBe(413);
    expect(fake.calls.organize).toEqual([]);
  });

  it('os erros do provedor viram respostas com o motivo', async () => {
    const cases: [AiError, number][] = [
      [new AiError('key_rejected', 'chave recusada'), 422],
      [new AiError('provider_rate_limited', 'espere'), 429],
      [new AiError('refused', 'não quis'), 422],
      [new AiError('truncated', 'cortou'), 422],
      [new AiError('bad_output', 'fora do formato'), 502],
      [new AiError('provider_error', 'falhou'), 502],
    ];
    for (const [error, status] of cases) {
      const failing = setup({
        provider: createFakeProvider({
          organize: () => {
            throw error;
          },
        }),
      });
      await failing.saveKey();
      await failing.choose();
      const response = await failing.send('POST', '/ai/organize', { text: 'oi', format: 'flow' });
      expect(response.status, error.code).toBe(status);
      expect(await response.json()).toEqual({ error: error.message, code: error.code });
    }
  });

  it('erro desconhecido vira 500 sem vazar o texto', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { saveKey, choose, send } = setup({
      provider: createFakeProvider({
        organize: () => {
          throw new Error('detalhe interno secreto');
        },
      }),
    });
    await saveKey();
    await choose();
    const response = await send('POST', '/ai/organize', { text: 'oi', format: 'flow' });
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('secreto');
  });
});

describe('API de IA: limite por minuto', () => {
  it('passando do limite de organizar, responde 429 e volta depois de um minuto', async () => {
    const { saveKey, choose, send, clock } = setup();
    await saveKey();
    await choose();
    const body = { text: 'oi', format: 'flow' };
    for (let i = 0; i < ORGANIZE_PER_MINUTE; i++) {
      expect((await send('POST', '/ai/organize', body)).status).toBe(200);
    }
    const blocked = await send('POST', '/ai/organize', body);
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ code: 'too_many_requests' });
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);

    clock.now = new Date(clock.now.getTime() + 61_000);
    expect((await send('POST', '/ai/organize', body)).status).toBe(200);
  });

  it('o limite é por pessoa', async () => {
    const { saveKey, choose, send } = setup();
    await saveKey();
    await choose();
    await saveKey('anthropic', SECRET, BIA);
    await choose('anthropic', BIA);
    for (let i = 0; i < ORGANIZE_PER_MINUTE; i++) {
      await send('POST', '/ai/organize', { text: 'oi', format: 'flow' });
    }
    expect((await send('POST', '/ai/organize', { text: 'oi', format: 'flow' })).status).toBe(429);
    expect((await send('POST', '/ai/organize', { text: 'oi', format: 'flow' }, BIA)).status).toBe(
      200,
    );
  });

  it('as outras rotas têm um limite maior', async () => {
    const { saveKey, send } = setup();
    await saveKey();
    let blocked = 0;
    for (let i = 0; i < OTHER_PER_MINUTE + 2; i++) {
      if ((await send('GET', '/ai/models/anthropic')).status === 429) blocked += 1;
    }
    // A chave salva já gastou um dos pedidos do minuto.
    expect(blocked).toBe(3);
  });
});

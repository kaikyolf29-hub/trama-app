import { describe, expect, it } from 'vitest';
import { createApp } from '../index';
import { defaultDeps } from '../deps';
import { createVault } from '../drive/vault';
import { createMemoryStore } from '../projects/memory-store';
import type { Env } from '../env';
import { createMemoryDigestStore } from './memory-store';
import {
  apiBaseUrl,
  createUnsubscribeToken,
  readUnsubscribeToken,
  siteBaseUrl,
  unsubscribeUrl,
} from './unsubscribe';

const KEY = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i + 1)));
const OTHER_KEY = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i + 9)));
const ANA = '11111111-1111-4111-8111-111111111111';
const ENV: Env = {
  APP_URL: 'https://trama.example',
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_falsa',
  TOKEN_ENCRYPTION_KEY: KEY,
};

function setup(env: Env = ENV) {
  const fake = createMemoryDigestStore();
  fake.addPerson(ANA);
  const app = createApp(() => createMemoryStore(), {
    digest: () => fake.store,
  });
  const call = (path: string, init?: RequestInit) => app.request(path, init, env);
  return { fake, call };
}

async function tokenFor(kind: 'weekly_summary' | 'review_reminder', key = KEY) {
  return createUnsubscribeToken(await createVault(key), ANA, kind);
}

describe('token de descadastro', () => {
  it('ida e volta: devolve a pessoa e o tipo', async () => {
    const vault = await createVault(KEY);
    const token = await createUnsubscribeToken(vault, ANA, 'review_reminder');
    expect(await readUnsubscribeToken(vault, token)).toEqual({
      userId: ANA,
      kind: 'review_reminder',
    });
  });

  it('recusa token adulterado, de outra chave, truncado ou de outro uso', async () => {
    const vault = await createVault(KEY);
    const token = await tokenFor('weekly_summary');
    expect(
      await readUnsubscribeToken(vault, token.replace('weekly_summary', 'review_reminder')),
    ).toBeNull();
    expect(await readUnsubscribeToken(vault, token.slice(0, -2))).toBeNull();
    expect(
      await readUnsubscribeToken(vault, await tokenFor('weekly_summary', OTHER_KEY)),
    ).toBeNull();
    expect(await readUnsubscribeToken(vault, '')).toBeNull();
    // Uma assinatura válida de outro texto (como o `state` do Drive) não serve.
    expect(await readUnsubscribeToken(vault, await vault.sign('qualquer-coisa'))).toBeNull();
    expect(await readUnsubscribeToken(vault, await vault.sign(`unsub:${ANA}:outro`))).toBeNull();
    expect(
      await readUnsubscribeToken(vault, await vault.sign('unsub:nao-e-id:weekly_summary')),
    ).toBeNull();
  });
});

describe('endereços', () => {
  it('a API e o site vêm das variáveis, ou do workers.dev da conta', () => {
    expect(apiBaseUrl({ API_URL: 'https://api.trama.example/' })).toBe('https://api.trama.example');
    expect(apiBaseUrl({ WORKERS_SUBDOMAIN: 'conta' })).toBe('https://trama-api.conta.workers.dev');
    expect(apiBaseUrl({})).toBeNull();
    expect(siteBaseUrl({ APP_URL: 'https://trama.example/qualquer/caminho' })).toBe(
      'https://trama.example',
    );
    expect(siteBaseUrl({ WORKERS_SUBDOMAIN: 'conta' })).toBe('https://trama.conta.workers.dev');
    expect(siteBaseUrl({})).toBeNull();
  });

  it('o link leva o token já codificado', () => {
    expect(unsubscribeUrl('https://api.example', 'a b.c')).toBe(
      'https://api.example/unsubscribe?t=a%20b.c',
    );
  });
});

describe('GET e POST /unsubscribe', () => {
  it('desliga só a preferência do e-mail do link, sem login, e mostra a confirmação', async () => {
    const { fake, call } = setup();
    const token = await tokenFor('weekly_summary');
    const response = await call(`/unsubscribe?t=${encodeURIComponent(token)}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('cache-control')).toBe('no-store');
    const html = await response.text();
    expect(html).toContain('Resumo semanal desligado');
    expect(html).toContain('href="https://trama.example/configuracoes"');
    expect(fake.preferences.get(ANA)).toEqual({ weeklySummary: false, reviewReminders: false });
  });

  it('o lembrete desliga o lembrete e deixa o resumo como estava', async () => {
    const { fake, call } = setup();
    fake.addPerson(ANA, { weeklySummary: true, reviewReminders: true });
    const token = await tokenFor('review_reminder');
    const response = await call(`/unsubscribe?t=${encodeURIComponent(token)}`);
    expect(await response.text()).toContain('Lembrete de revisão desligado');
    expect(fake.preferences.get(ANA)).toEqual({ weeklySummary: true, reviewReminders: false });
  });

  it('o POST de um clique do programa de e-mail faz o mesmo', async () => {
    const { fake, call } = setup();
    const token = await tokenFor('weekly_summary');
    const response = await call(`/unsubscribe?t=${encodeURIComponent(token)}`, {
      method: 'POST',
      body: 'List-Unsubscribe=One-Click',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    expect(response.status).toBe(200);
    expect(fake.preferenceOf(ANA, 'weekly_summary')).toBe(false);
  });

  it('link inválido não mexe em nada e explica', async () => {
    const { fake, call } = setup();
    const token = await tokenFor('weekly_summary');
    for (const t of [`${token}x`, 'lixo', '']) {
      const response = await call(`/unsubscribe?t=${encodeURIComponent(t)}`);
      expect(response.status).toBe(400);
      expect(await response.text()).toContain('Link inválido');
    }
    expect((await call('/unsubscribe')).status).toBe(400);
    expect(fake.preferences.get(ANA)).toEqual({ weeklySummary: true, reviewReminders: false });
  });

  it('não escapa texto do link para a página', async () => {
    const { call } = setup();
    const response = await call(
      `/unsubscribe?t=${encodeURIComponent('<script>alert(1)</script>')}`,
    );
    expect(await response.text()).not.toContain('<script>');
  });

  it('sem a chave secreta ou a chave de criptografia, responde 503 sem quebrar', async () => {
    const withoutSecret = createApp(() => createMemoryStore(), { digest: () => null });
    const response = await withoutSecret.request('/unsubscribe?t=x', undefined, ENV);
    expect(response.status).toBe(503);
    const { call } = setup({ ...ENV, TOKEN_ENCRYPTION_KEY: undefined });
    const noKey = await call('/unsubscribe?t=x');
    expect(noKey.status).toBe(503);
  });

  it('falha ao gravar mostra o erro sem vazar nada', async () => {
    const fake = createMemoryDigestStore();
    const app = createApp(() => createMemoryStore(), {
      digest: () => ({
        ...fake.store,
        setPreference: () => Promise.reject(new Error('Supabase (set_email_preference): 500')),
      }),
    });
    const token = await tokenFor('weekly_summary');
    const response = await app.request(
      `/unsubscribe?t=${encodeURIComponent(token)}`,
      undefined,
      ENV,
    );
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('Supabase');
  });
});

describe('o Worker', () => {
  it('exporta as rotas (fetch) e a tarefa agendada (scheduled)', async () => {
    const worker = (await import('../index')).default;
    expect(typeof worker.fetch).toBe('function');
    expect(typeof worker.scheduled).toBe('function');
    // Sem a chave secreta no ambiente, não há armazém: a tarefa só diz por que não mandou nada.
    expect(defaultDeps().digest({})).toBeNull();
  });
});

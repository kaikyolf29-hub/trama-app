import { DEFAULT_EMAIL_PREFERENCES, DEFAULT_TIME_ZONE, profileSchema } from '@trama/core';
import { describe, expect, it } from 'vitest';
import { createApp } from '../index';
import { createMemoryStore } from '../projects/memory-store';
import { SessionError } from '../projects/store';
import { createMemoryAccountStore } from './memory-store';
import type { AccountStore } from './store';
import { userIdFromToken } from './supabase-store';

const TOKEN = 'token-da-ana';
const ana = {
  name: 'Ana Souza',
  timezone: DEFAULT_TIME_ZONE,
  emailPreferences: DEFAULT_EMAIL_PREFERENCES,
};

function setup(store: AccountStore = createMemoryAccountStore(ana)) {
  const tokens: string[] = [];
  const app = createApp(
    () => createMemoryStore(),
    (_env, token) => {
      tokens.push(token);
      return store;
    },
  );
  const call = (path: string, init: RequestInit = {}) =>
    app.request(path, {
      ...init,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
  const patch = (body: unknown) =>
    call('/account/profile', { method: 'PATCH', body: JSON.stringify(body) });
  return { app, call, patch, tokens };
}

describe('API da conta: perfil', () => {
  it('exige o token de login e o passa para o banco', async () => {
    const { app, call, tokens } = setup();
    const response = await app.request('/account/profile');
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Entre na sua conta para continuar.' });
    expect((await call('/account/profile')).status).toBe(200);
    expect(tokens).toEqual([TOKEN]);
  });

  it('devolve o perfil no formato do contrato', async () => {
    const { call } = setup();
    const response = await call('/account/profile');
    expect(profileSchema.parse(await response.json())).toEqual(ana);
  });

  it('muda o nome, o fuso e as preferências', async () => {
    const store = createMemoryAccountStore(ana);
    const { patch, call } = setup(store);
    const response = await patch({
      name: '  Ana Maria  ',
      timezone: 'America/Manaus',
      emailPreferences: { weeklySummary: false },
    });
    expect(response.status).toBe(200);
    const expected = {
      name: 'Ana Maria',
      timezone: 'America/Manaus',
      emailPreferences: { weeklySummary: false, reviewReminders: false },
    };
    expect(await response.json()).toEqual(expected);
    expect(store.profile).toEqual(expected);
    expect(await (await call('/account/profile')).json()).toEqual(expected);
  });

  it('uma preferência não apaga a outra', async () => {
    const { patch } = setup();
    await patch({ emailPreferences: { reviewReminders: true } });
    const response = await patch({ emailPreferences: { weeklySummary: false } });
    expect(await response.json()).toMatchObject({
      emailPreferences: { weeklySummary: false, reviewReminders: true },
    });
  });

  it('recusa pedido vazio, nome em branco ou comprido, fuso falso e corpo quebrado', async () => {
    const { patch, call } = setup();
    for (const body of [
      {},
      { name: '   ' },
      { name: 'a'.repeat(81) },
      { timezone: 'Marte/Olympus' },
      { emailPreferences: { weeklySummary: 'sim' } },
    ]) {
      const response = await patch(body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(await response.json()).toEqual({ error: 'Dados do perfil inválidos.' });
    }
    const broken = await call('/account/profile', { method: 'PATCH', body: '{ não é json' });
    expect(broken.status).toBe(400);
  });

  it('não deixa mudar o que não é do perfil (e-mail, id)', async () => {
    const store = createMemoryAccountStore(ana);
    const { patch } = setup(store);
    const response = await patch({ name: 'Bia', email: 'outra@exemplo.com', id: 'x' });
    expect(response.status).toBe(200);
    expect(Object.keys(store.profile ?? {}).sort()).toEqual([
      'emailPreferences',
      'name',
      'timezone',
    ]);
  });

  it('responde 404 para quem não tem perfil', async () => {
    const { call, patch } = setup(createMemoryAccountStore(null));
    expect((await call('/account/profile')).status).toBe(404);
    const response = await patch({ name: 'Ana' });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Perfil não encontrado.' });
  });

  it('sessão que acabou vira 401', async () => {
    const { call } = setup({
      getProfile: () => Promise.reject(new SessionError()),
      updateProfile: () => Promise.reject(new SessionError()),
    });
    const response = await call('/account/profile');
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: 'Sua sessão acabou. Entre de novo para continuar.',
    });
  });

  it('recusa corpo grande demais', async () => {
    const { call } = setup();
    const response = await call('/account/profile', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'a'.repeat(70_000) }),
    });
    expect(response.status).toBe(413);
  });
});

describe('id da pessoa no token', () => {
  const token = (payload: object) =>
    `x.${btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.y`;

  it('lê o campo sub', () => {
    expect(userIdFromToken(token({ sub: 'abc-123' }))).toBe('abc-123');
  });

  it('token sem sub ou quebrado vira erro de sessão', () => {
    expect(() => userIdFromToken(token({}))).toThrow(SessionError);
    expect(() => userIdFromToken('lixo')).toThrow(SessionError);
  });
});

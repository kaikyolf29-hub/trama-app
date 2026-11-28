import { describe, expect, it, vi } from 'vitest';
import { createAccountApi } from './account-api';

const profile = {
  name: 'Ana Souza',
  timezone: 'America/Sao_Paulo',
  emailPreferences: { weeklySummary: true, reviewReminders: false },
};

function api(response: Response | Error, token: string | null = 'tok') {
  const fetcher = vi.fn<typeof fetch>(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  return {
    fetcher,
    client: createAccountApi({
      baseUrl: 'http://api.exemplo/',
      getToken: () => Promise.resolve(token),
      fetch: fetcher,
    }),
  };
}

describe('API da conta no site', () => {
  it('lê o perfil com o token de login', async () => {
    const { client, fetcher } = api(Response.json(profile));
    expect(await client.getProfile()).toEqual(profile);
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe('http://api.exemplo/account/profile');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer tok');
  });

  it('manda só o que mudou no PATCH', async () => {
    const { client, fetcher } = api(Response.json(profile));
    await client.updateProfile({ emailPreferences: { weeklySummary: false } });
    const [, init] = fetcher.mock.calls[0] ?? [];
    expect(init?.method).toBe('PATCH');
    expect(init?.body).toBe(JSON.stringify({ emailPreferences: { weeklySummary: false } }));
  });

  it('usa a frase de erro da API', async () => {
    const { client } = api(Response.json({ error: 'Dados do perfil inválidos.' }, { status: 400 }));
    await expect(client.updateProfile({ name: 'x' })).rejects.toMatchObject({
      message: 'Dados do perfil inválidos.',
      status: 400,
    });
  });

  it('sem conexão, sem sessão e resposta fora do contrato viram erros em português', async () => {
    await expect(api(new TypeError('fail')).client.getProfile()).rejects.toMatchObject({
      message: expect.stringContaining('Sem conexão') as unknown,
      status: 0,
    });
    await expect(api(Response.json(profile), null).client.getProfile()).rejects.toMatchObject({
      status: 401,
    });
    await expect(api(Response.json({ name: 1 })).client.getProfile()).rejects.toMatchObject({
      status: 502,
    });
  });
});

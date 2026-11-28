import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Supabase } from '../supabase';
import { EMAIL_SEND_ERROR, OFFLINE_ERROR, RECOVERY_SEND_ERROR } from './errors';
import { createSupabaseAuthClient } from './supabase-client';

/** Só o pedaço do Supabase Auth que a recuperação usa. */
function withResetError(error: unknown) {
  const supabase = {
    auth: { resetPasswordForEmail: () => Promise.resolve({ data: {}, error }) },
  } as unknown as Supabase;
  return createSupabaseAuthClient(supabase, 'https://trama.exemplo');
}

describe('recuperação de senha', () => {
  it('falha no envio do e-mail (500 do servidor) explica que o e-mail não saiu', async () => {
    // Como no site publicado: o SMTP recusou o destinatário e o Supabase respondeu 500.
    const client = withResetError({ name: 'AuthRetryableFetchError', status: 500 });
    expect(await client.requestPasswordReset('ana@exemplo.com')).toEqual({
      ok: false,
      error: RECOVERY_SEND_ERROR,
    });
  });

  it('sem internet continua dizendo que está sem conexão', async () => {
    const client = withResetError({ name: 'AuthRetryableFetchError', status: 0 });
    expect(await client.requestPasswordReset('ana@exemplo.com')).toEqual({
      ok: false,
      error: OFFLINE_ERROR,
    });
  });

  it('pedido aceito dá certo', async () => {
    const client = withResetError(null);
    expect(await client.requestPasswordReset('ana@exemplo.com')).toEqual({
      ok: true,
      value: undefined,
    });
  });
});

describe('troca de e-mail e de nome', () => {
  function withUpdate(error: unknown, calls: unknown[][] = []) {
    const supabase = {
      auth: {
        updateUser: (...args: unknown[]) => {
          calls.push(args);
          return Promise.resolve({ data: {}, error });
        },
        verifyOtp: (...args: unknown[]) => {
          calls.push(args);
          return Promise.resolve({ data: {}, error });
        },
      },
    } as unknown as Supabase;
    return createSupabaseAuthClient(supabase, 'https://trama.exemplo');
  }

  it('pede a troca com o retorno para as Configurações', async () => {
    const calls: unknown[][] = [];
    const result = await withUpdate(null, calls).updateEmail('nova@exemplo.com');
    expect(result.ok).toBe(true);
    expect(calls[0]).toEqual([
      { email: 'nova@exemplo.com' },
      { emailRedirectTo: 'https://trama.exemplo/configuracoes' },
    ]);
  });

  it('e-mail que já tem conta e falha de envio ganham frases próprias', async () => {
    expect(await withUpdate({ code: 'email_exists', status: 422 }).updateEmail('a@b.co')).toEqual({
      ok: false,
      error: 'Já existe uma conta com este e-mail. Use outro endereço.',
    });
    expect(
      await withUpdate({ name: 'AuthRetryableFetchError', status: 500 }).updateEmail('a@b.co'),
    ).toEqual({ ok: false, error: EMAIL_SEND_ERROR });
  });

  it('confere o link com o tipo email_change e guarda o nome nos dados da conta', async () => {
    const calls: unknown[][] = [];
    const client = withUpdate(null, calls);
    await client.verifyEmailChange('hash');
    await client.updateName('Ana');
    expect(calls).toEqual([
      [{ token_hash: 'hash', type: 'email_change' }],
      [{ data: { name: 'Ana' } }],
    ]);
  });
});

describe('sessão separada para o conector MCP', () => {
  afterEach(() => vi.unstubAllGlobals());

  const site = {
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: { user: { email: 'ana@exemplo.com' } } } }),
    },
  } as unknown as Supabase;
  const config = { url: 'https://projeto.supabase.co', publishableKey: 'sb_publishable_x' };

  it('entra de novo com a senha num cliente à parte, sem guardar nada no navegador', async () => {
    const requests: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({
          url: input instanceof Request ? input.url : input.toString(),
          body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
        });
        return Promise.resolve(
          Response.json({
            access_token: 'acesso-novo',
            refresh_token: 'refresh-novo',
            token_type: 'bearer',
            expires_in: 3600,
            user: { id: 'u1', email: 'ana@exemplo.com', aud: 'authenticated' },
          }),
        );
      }),
    );
    const client = createSupabaseAuthClient(site, 'https://trama.exemplo', config);
    const result = await client.openConnectorSession('senha-segura-1');
    expect(result).toEqual({
      ok: true,
      value: { accessToken: 'acesso-novo', refreshToken: 'refresh-novo' },
    });
    expect(requests[0]?.url).toContain('/auth/v1/token?grant_type=password');
    expect(requests[0]?.body).toMatchObject({
      email: 'ana@exemplo.com',
      password: 'senha-segura-1',
    });
    expect(Object.keys(localStorage)).toEqual([]);
  });

  it('senha errada vira frase em português', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json(
            {
              error: 'invalid_grant',
              error_code: 'invalid_credentials',
              msg: 'Invalid login credentials',
            },
            { status: 400 },
          ),
        ),
      ),
    );
    const client = createSupabaseAuthClient(site, 'https://trama.exemplo', config);
    const result = await client.openConnectorSession('errada');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe('E-mail ou senha incorretos.');
  });

  it('sem a configuração do Supabase, não abre sessão', async () => {
    const client = createSupabaseAuthClient(site, 'https://trama.exemplo');
    expect((await client.openConnectorSession('x')).ok).toBe(false);
  });
});

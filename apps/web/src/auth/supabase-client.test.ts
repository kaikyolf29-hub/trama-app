import { describe, expect, it } from 'vitest';
import type { Supabase } from '../supabase';
import { OFFLINE_ERROR, RECOVERY_SEND_ERROR } from './errors';
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

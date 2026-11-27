import { describe, expect, it } from 'vitest';
import { greetingFor } from '../pages/greeting';
import { safeReturnPath } from './return-path';
import { authErrorMessage, GENERIC_ERROR, isServerError } from './errors';
import { newPasswordSchema, signUpSchema, validate } from './validation';

describe('authErrorMessage', () => {
  it.each([
    ['invalid_credentials', 'E-mail ou senha incorretos.'],
    ['otp_expired', 'Este link expirou ou já foi usado. Peça um link novo.'],
    [
      'over_email_send_rate_limit',
      'Muitos e-mails pedidos em pouco tempo. Espere um minuto e tente de novo.',
    ],
  ])('traduz %s', (code, message) => {
    expect(authErrorMessage({ code, status: 400 })).toBe(message);
  });

  it('reconhece a falta de conexão', () => {
    expect(authErrorMessage({ name: 'AuthRetryableFetchError', status: 0 })).toContain(
      'Sem conexão',
    );
  });

  it('cai numa mensagem genérica para o resto', () => {
    expect(authErrorMessage({ code: 'algo_novo' })).toBe(GENERIC_ERROR);
  });

  it('erro do servidor (5xx) não vira "sem conexão"', () => {
    // O supabase-js chama de AuthRetryableFetchError também o 500 do servidor.
    expect(authErrorMessage({ name: 'AuthRetryableFetchError', status: 500 })).toBe(GENERIC_ERROR);
    expect(authErrorMessage({ name: 'AuthRetryableFetchError', status: 503 })).toBe(GENERIC_ERROR);
    expect(isServerError({ status: 500 })).toBe(true);
    expect(isServerError({ status: 400 })).toBe(false);
    expect(isServerError(null)).toBe(false);
    expect(authErrorMessage(null)).toBe(GENERIC_ERROR);
  });
});

describe('validação', () => {
  it('limpa espaços do nome e do e-mail', () => {
    const result = validate(signUpSchema, {
      name: '  Ana  ',
      email: ' ana@exemplo.com ',
      password: '12345678',
    });
    expect(result).toEqual({
      ok: true,
      data: { name: 'Ana', email: 'ana@exemplo.com', password: '12345678' },
    });
  });

  it('recusa senha com mais de 72 caracteres (limite do bcrypt)', () => {
    const result = validate(newPasswordSchema, {
      password: 'a'.repeat(73),
      confirm: 'a'.repeat(73),
    });
    expect(result).toEqual({ ok: false, errors: { password: 'Use no máximo 72 caracteres.' } });
  });
});

describe('safeReturnPath', () => {
  it.each(['/', '/fluxos/1', '/nova-senha?x=1'])('aceita %s', (path) => {
    expect(safeReturnPath(path)).toBe(path);
  });

  it.each(['//golpe.example', '/\\golpe.example', 'https://golpe.example', 'fluxos', 42])(
    'recusa %s',
    (path) => {
      expect(safeReturnPath(path)).toBeUndefined();
    },
  );
});

describe('greetingFor', () => {
  it('cumprimenta pela hora', () => {
    expect(greetingFor(new Date(2026, 10, 27, 9))).toBe('Bom dia');
    expect(greetingFor(new Date(2026, 10, 27, 14))).toBe('Boa tarde');
    expect(greetingFor(new Date(2026, 10, 27, 21))).toBe('Boa noite');
    expect(greetingFor(new Date(2026, 10, 27, 3))).toBe('Boa noite');
  });
});

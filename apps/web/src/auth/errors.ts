/** Mensagem para quando algo falha sem um motivo conhecido. */
export const GENERIC_ERROR = 'Algo deu errado. Tente de novo em instantes.';

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  email_not_confirmed:
    'Confirme o seu e-mail antes de entrar. O link está na sua caixa de entrada.',
  user_already_exists: 'Já existe uma conta com este e-mail. Entre ou recupere a senha.',
  email_exists: 'Já existe uma conta com este e-mail. Entre ou recupere a senha.',
  weak_password:
    'Essa senha é fácil de adivinhar. Use pelo menos 8 caracteres, misturando letras e números.',
  same_password: 'A senha nova precisa ser diferente da atual.',
  over_email_send_rate_limit:
    'Muitos e-mails pedidos em pouco tempo. Espere um minuto e tente de novo.',
  over_request_rate_limit: 'Muitas tentativas seguidas. Espere um minuto e tente de novo.',
  otp_expired: 'Este link expirou ou já foi usado. Peça um link novo.',
  email_address_invalid: 'Este e-mail não é válido.',
  signup_disabled: 'Os cadastros estão fechados no momento.',
  session_not_found: 'Sua sessão terminou. Entre de novo.',
  user_banned: 'Esta conta está bloqueada.',
};

interface ErrorLike {
  code?: unknown;
  status?: unknown;
  name?: unknown;
}

/** Traduz um erro do Supabase Auth para uma frase que a pessoa entende. */
export function authErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return GENERIC_ERROR;
  const { code, status, name } = error as ErrorLike;
  if (typeof code === 'string' && code in MESSAGES) return MESSAGES[code] ?? GENERIC_ERROR;
  if (name === 'AuthRetryableFetchError' || status === 0) {
    return 'Sem conexão com o servidor. Confira a internet e tente de novo.';
  }
  return GENERIC_ERROR;
}

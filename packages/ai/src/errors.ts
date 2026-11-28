import type { AiErrorCode, AiProvider } from '@trama/core';

/** Erro de uma chamada de IA, com o motivo (`code`) e uma frase pronta para a tela. */
export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

const NAMES: Record<AiProvider, string> = {
  anthropic: 'o Claude',
  google: 'o Gemini',
  openai: 'o ChatGPT',
};

/** As frases de cada situação, iguais nos três provedores. */
export const messages = {
  keyRejected: (provider: AiProvider) =>
    new AiError(
      'key_rejected',
      `${capitalize(NAMES[provider])} recusou a chave. Confira se copiou inteira e se ela está ativa na conta do provedor.`,
    ),
  rateLimited: (provider: AiProvider) =>
    new AiError(
      'provider_rate_limited',
      `${capitalize(NAMES[provider])} pediu para esperar: a conta chegou a um limite de uso ou de pedidos por minuto. Tente de novo daqui a pouco e confira o plano e o saldo no site do provedor.`,
    ),
  refused: (provider: AiProvider) =>
    new AiError(
      'refused',
      `${capitalize(NAMES[provider])} não quis responder a este texto. Reescreva o trecho e tente de novo.`,
    ),
  truncated: () =>
    new AiError(
      'truncated',
      'A resposta ficou grande demais e veio cortada. Use um texto menor ou o esforço Rápido.',
    ),
  badOutput: () =>
    new AiError(
      'bad_output',
      'A IA respondeu fora do formato esperado. Tente de novo; se repetir, troque de modelo.',
    ),
  other: (provider: AiProvider) =>
    new AiError(
      'provider_error',
      `Não deu para falar com ${NAMES[provider]} agora. Tente de novo em instantes.`,
    ),
  unusableModel: (provider: AiProvider) =>
    new AiError(
      'provider_error',
      `${capitalize(NAMES[provider])} não aceitou este modelo ou esta configuração. Escolha outro modelo em Configurações.`,
    ),
};

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

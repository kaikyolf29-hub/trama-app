/**
 * @trama/ai — os provedores de IA do Trama (Claude, Gemini e ChatGPT), com os SDKs oficiais.
 * Só o Worker da API usa este pacote: a chave da pessoa nunca chega ao navegador.
 */
import type { AiProvider as AiProviderId } from '@trama/core';
import { createAnthropicProvider } from './anthropic';
import { createGoogleProvider } from './google';
import { createOpenAiProvider } from './openai';
import type { AiProvider, ProviderOptions } from './types';

export { AiError } from './errors';
export { buildEstimate, expectedOutputTokens, priceOf } from './estimate';
export {
  ANTHROPIC_EFFORT,
  GOOGLE_BUDGET,
  GOOGLE_LEVEL,
  OPENAI_EFFORT,
  googleUsesBudget,
  openaiSupportsReasoning,
} from './effort';
export { MAX_OUTPUT_TOKENS, prepareRequest, toJsonSchema } from './organize';
export { ORGANIZE_PROMPTS } from '../prompts';
export { createAnthropicProvider, createGoogleProvider, createOpenAiProvider };
export type {
  AiProvider,
  Estimate,
  OrganizeParams,
  OrganizeResult,
  ProviderOptions,
} from './types';

/** O provedor escolhido, com a chave da pessoa. Um cliente novo por pedido. */
export function createProvider(
  provider: AiProviderId,
  apiKey: string,
  options: ProviderOptions = {},
): AiProvider {
  switch (provider) {
    case 'anthropic':
      return createAnthropicProvider(apiKey, options);
    case 'google':
      return createGoogleProvider(apiKey, options);
    case 'openai':
      return createOpenAiProvider(apiKey, options);
  }
}

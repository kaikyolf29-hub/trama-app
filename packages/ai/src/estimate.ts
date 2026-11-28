import type { AiEffort, AiOrganizeFormat, AiProvider } from '@trama/core';
import type { Estimate } from './types';

/**
 * Estimativa de custo antes de enviar. Os tokens de entrada vêm do provedor (contagem de
 * verdade); os de saída são uma previsão, porque a resposta ainda não existe. O preço só é
 * conhecido para os modelos da tabela abaixo (US$ por milhão de tokens, tabela de preços da
 * Anthropic); nos outros, `costUsd` é `null` e a tela mostra só os tokens.
 */

interface Price {
  input: number;
  output: number;
}

/** Primeiro que casar vale; do mais específico ao mais geral. Claude, preços de lista em 2026-11. */
const ANTHROPIC_PRICES: readonly [RegExp, Price][] = [
  [/^claude-haiku-5-5/, { input: 0.1, output: 0.5 }],
  [/^claude-haiku-4-5/, { input: 1, output: 5 }],
  [/^claude-sonnet-5(-5)?(-|$)/, { input: 2, output: 10 }],
  [/^claude-sonnet-4-6/, { input: 3, output: 15 }],
  [/^claude-opus-5-5/, { input: 4, output: 20 }],
  [/^claude-opus-(5|4-8|4-7|4-6)(-|$)/, { input: 5, output: 25 }],
];

export function priceOf(provider: AiProvider, model: string): Price | null {
  if (provider !== 'anthropic') return null;
  return ANTHROPIC_PRICES.find(([pattern]) => pattern.test(model))?.[1] ?? null;
}

/** Tokens que o raciocínio do modelo gasta antes de responder, por esforço (previsão). */
const THINKING_TOKENS: Record<AiEffort, number> = { fast: 300, balanced: 1500, thorough: 5000 };

/**
 * Quantos tokens de saída esperar: o fluxo ou o prompt costuma ter o tamanho da fala (em JSON),
 * mais o raciocínio do esforço escolhido. Limitado ao que o pedido aceita de saída.
 */
export function expectedOutputTokens(
  format: AiOrganizeFormat,
  inputTokens: number,
  effort: AiEffort,
  maxOutputTokens: number,
): number {
  const body = format === 'prompt' ? inputTokens * 0.9 : inputTokens * 1.6;
  const guess = Math.round(Math.max(400, body) + THINKING_TOKENS[effort]);
  return Math.min(guess, maxOutputTokens);
}

/** Junta a contagem de entrada, a previsão de saída e o preço (se houver). */
export function buildEstimate(input: {
  provider: AiProvider;
  model: string;
  format: AiOrganizeFormat;
  effort: AiEffort;
  inputTokens: number;
  maxOutputTokens: number;
}): Estimate {
  const outputTokens = expectedOutputTokens(
    input.format,
    input.inputTokens,
    input.effort,
    input.maxOutputTokens,
  );
  const price = priceOf(input.provider, input.model);
  const costUsd = price
    ? (input.inputTokens * price.input + outputTokens * price.output) / 1_000_000
    : null;
  return { inputTokens: input.inputTokens, outputTokens, costUsd };
}

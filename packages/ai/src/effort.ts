import type { AiEffort } from '@trama/core';

/**
 * Rápido, Equilibrado e Caprichado traduzidos para o parâmetro de cada provedor. O esforço
 * sempre vai de forma explícita: o padrão muda de modelo para modelo (no Claude, Opus 5.5 e
 * Haiku 5.5 usam `medium` e os outros `high`), e o Trama não quer depender disso.
 */

/** Claude: `output_config.effort`. */
export const ANTHROPIC_EFFORT = {
  fast: 'low',
  balanced: 'medium',
  thorough: 'high',
} as const satisfies Record<AiEffort, 'low' | 'medium' | 'high'>;

/** ChatGPT: `reasoning.effort`. */
export const OPENAI_EFFORT = {
  fast: 'low',
  balanced: 'medium',
  thorough: 'high',
} as const satisfies Record<AiEffort, 'low' | 'medium' | 'high'>;

/** Gemini 3 em diante: `thinkingConfig.thinkingLevel`. */
export const GOOGLE_LEVEL = {
  fast: 'LOW',
  balanced: 'MEDIUM',
  thorough: 'HIGH',
} as const satisfies Record<AiEffort, 'LOW' | 'MEDIUM' | 'HIGH'>;

/** Gemini 2.5: `thinkingConfig.thinkingBudget`, em tokens de raciocínio. */
export const GOOGLE_BUDGET = {
  fast: 1024,
  balanced: 4096,
  thorough: 16384,
} as const satisfies Record<AiEffort, number>;

/**
 * O Gemini 2.5 usa orçamento de raciocínio (`thinkingBudget`); do 3 em diante, nível
 * (`thinkingLevel`). O nome do modelo diz qual vale.
 */
export function googleUsesBudget(model: string): boolean {
  return /^(models\/)?gemini-2(\.|-)/.test(model);
}

/**
 * Só os modelos de raciocínio da OpenAI (o1, o3, o4, gpt-5 em diante) aceitam `reasoning`; os
 * outros (gpt-4o, gpt-4.1...) recusam o parâmetro.
 */
export function openaiSupportsReasoning(model: string): boolean {
  return /^(o\d|gpt-([5-9]|\d{2,}))/.test(model);
}

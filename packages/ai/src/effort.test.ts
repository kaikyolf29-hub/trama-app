import { describe, expect, it } from 'vitest';
import {
  ANTHROPIC_EFFORT,
  GOOGLE_BUDGET,
  GOOGLE_LEVEL,
  OPENAI_EFFORT,
  googleUsesBudget,
  openaiSupportsReasoning,
} from './effort';
import { buildEstimate, expectedOutputTokens, priceOf } from './estimate';
import { toJsonSchema } from './organize';
import { aiFlowOutputSchema } from '@trama/core';

describe('esforço', () => {
  it('Rápido, Equilibrado e Caprichado viram low, medium e high no Claude e na OpenAI', () => {
    expect(ANTHROPIC_EFFORT).toEqual({ fast: 'low', balanced: 'medium', thorough: 'high' });
    expect(OPENAI_EFFORT).toEqual({ fast: 'low', balanced: 'medium', thorough: 'high' });
  });

  it('no Gemini vira nível (3 em diante) ou orçamento (2.5)', () => {
    expect(GOOGLE_LEVEL).toEqual({ fast: 'LOW', balanced: 'MEDIUM', thorough: 'HIGH' });
    expect(GOOGLE_BUDGET.fast).toBeLessThan(GOOGLE_BUDGET.balanced);
    expect(GOOGLE_BUDGET.balanced).toBeLessThan(GOOGLE_BUDGET.thorough);
    expect(googleUsesBudget('gemini-2.5-pro')).toBe(true);
    expect(googleUsesBudget('models/gemini-2.5-flash')).toBe(true);
    expect(googleUsesBudget('gemini-3-pro')).toBe(false);
  });

  it('só os modelos de raciocínio da OpenAI recebem `reasoning`', () => {
    for (const model of ['o3', 'o4-mini', 'gpt-5', 'gpt-5.5-mini']) {
      expect(openaiSupportsReasoning(model), model).toBe(true);
    }
    for (const model of ['gpt-4o', 'gpt-4.1', 'gpt-4o-mini', 'chatgpt-4o-latest']) {
      expect(openaiSupportsReasoning(model), model).toBe(false);
    }
  });
});

describe('estimativa', () => {
  it('tem preço para os modelos do Claude da tabela e não para os outros', () => {
    expect(priceOf('anthropic', 'claude-haiku-5-5')).toEqual({ input: 0.1, output: 0.5 });
    expect(priceOf('anthropic', 'claude-sonnet-5-5')).toEqual({ input: 2, output: 10 });
    expect(priceOf('anthropic', 'claude-opus-5-5')).toEqual({ input: 4, output: 20 });
    expect(priceOf('anthropic', 'claude-opus-5-5-20270101')).toEqual({ input: 4, output: 20 });
    expect(priceOf('anthropic', 'claude-um-modelo-novo')).toBeNull();
    expect(priceOf('openai', 'gpt-5')).toBeNull();
    expect(priceOf('google', 'gemini-3-pro')).toBeNull();
  });

  it('a saída esperada cresce com o esforço e nunca passa do limite', () => {
    const fast = expectedOutputTokens('flow', 1000, 'fast', 16_000);
    const balanced = expectedOutputTokens('flow', 1000, 'balanced', 16_000);
    const thorough = expectedOutputTokens('flow', 1000, 'thorough', 16_000);
    expect(fast).toBeLessThan(balanced);
    expect(balanced).toBeLessThan(thorough);
    expect(expectedOutputTokens('flow', 50_000, 'thorough', 16_000)).toBe(16_000);
  });

  it('calcula o custo em dólares pela tabela de preços', () => {
    const estimate = buildEstimate({
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
      format: 'prompt',
      effort: 'balanced',
      inputTokens: 3000,
      maxOutputTokens: 16_000,
    });
    expect(estimate.inputTokens).toBe(3000);
    expect(estimate.costUsd).toBeCloseTo((3000 * 2 + estimate.outputTokens * 10) / 1_000_000, 8);
    const unknown = buildEstimate({
      provider: 'openai',
      model: 'gpt-5',
      format: 'flow',
      effort: 'fast',
      inputTokens: 100,
      maxOutputTokens: 16_000,
    });
    expect(unknown.costUsd).toBeNull();
  });
});

describe('esquema em JSON para o Gemini', () => {
  it('não leva $schema nem oneOf, e mantém todos os campos obrigatórios', () => {
    const json = toJsonSchema(aiFlowOutputSchema);
    const text = JSON.stringify(json);
    expect(text).not.toContain('$schema');
    expect(text).not.toContain('oneOf');
    expect(text).toContain('anyOf');
    expect(json.required).toEqual(['title', 'blocks', 'groups', 'links', 'corrections']);
  });
});

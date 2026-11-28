import {
  ApiError,
  BlockedReason,
  FinishReason,
  GoogleGenAI,
  ThinkingLevel,
  type ThinkingConfig,
} from '@google/genai';
import type { AiModel } from '@trama/core';
import { GOOGLE_BUDGET, GOOGLE_LEVEL, googleUsesBudget } from './effort';
import { AiError, messages } from './errors';
import { buildEstimate } from './estimate';
import {
  finishOutput,
  MAX_OUTPUT_TOKENS,
  parseJsonText,
  prepareRequest,
  toJsonSchema,
} from './organize';
import type { AiProvider, OrganizeParams, ProviderOptions } from './types';

const MODELS_LIMIT = 100;

/** Modelos que geram texto, sem os de imagem, voz, vídeo e conversa ao vivo. */
const NOT_FOR_TEXT = /(image|imagen|veo|tts|audio|live|embedding|aqa|robotics|computer-use)/;

/** O Gemini escreve o nome do modelo como `models/<id>`; a tela usa só o `<id>`. */
function shortName(name: string): string {
  return name.replace(/^models\//, '');
}

/** O raciocínio do Gemini: nível (3 em diante) ou orçamento de tokens (2.5), conforme o modelo. */
function thinkingFor(model: string, effort: OrganizeParams['effort']): ThinkingConfig {
  return googleUsesBudget(model)
    ? { thinkingBudget: GOOGLE_BUDGET[effort] }
    : { thinkingLevel: ThinkingLevel[GOOGLE_LEVEL[effort]] };
}

/**
 * Gemini, com o SDK oficial (`@google/genai`). A saída em JSON segue o esquema do core
 * (`responseJsonSchema`). Pela API do Gemini, uma chave inválida volta como erro 400, então na
 * lista de modelos (que não leva parâmetro nenhum) o 400 também vale como chave recusada.
 */
export function createGoogleProvider(apiKey: string, options: ProviderOptions = {}): AiProvider {
  const client = new GoogleGenAI({
    apiKey,
    httpOptions: { timeout: 100_000, ...(options.fetch ? { fetch: options.fetch } : {}) },
  });

  async function guard<T>(run: () => Promise<T>, keyCheck = false): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof AiError) throw error;
      if (error instanceof ApiError) {
        if (error.status === 401 || error.status === 403) throw messages.keyRejected('google');
        if (error.status === 429) throw messages.rateLimited('google');
        if (error.status === 400 || error.status === 404) {
          throw keyCheck ? messages.keyRejected('google') : messages.unusableModel('google');
        }
        throw messages.other('google');
      }
      throw error;
    }
  }

  return {
    id: 'google',

    listModels() {
      return guard(async () => {
        const models: AiModel[] = [];
        const pager = await client.models.list({ config: { pageSize: MODELS_LIMIT } });
        for await (const model of pager) {
          if (!model.name || !model.supportedActions?.includes('generateContent')) continue;
          const id = shortName(model.name);
          if (NOT_FOR_TEXT.test(id)) continue;
          models.push({
            id,
            name: model.displayName || id,
            maxInputTokens: model.inputTokenLimit ?? null,
            maxOutputTokens: model.outputTokenLimit ?? null,
          });
          if (models.length >= MODELS_LIMIT) break;
        }
        return models;
      }, true);
    },

    organize(params: OrganizeParams) {
      return guard(async () => {
        const request = prepareRequest(params.format, params.text);
        const response = await client.models.generateContent({
          model: params.model,
          contents: request.user,
          config: {
            systemInstruction: request.system,
            responseMimeType: 'application/json',
            responseJsonSchema: toJsonSchema(request.schema),
            thinkingConfig: thinkingFor(params.model, params.effort),
            maxOutputTokens: MAX_OUTPUT_TOKENS,
          },
        });
        const blocked = response.promptFeedback?.blockReason;
        if (blocked && blocked !== BlockedReason.BLOCKED_REASON_UNSPECIFIED) {
          throw messages.refused('google');
        }
        const finish = response.candidates?.[0]?.finishReason;
        if (finish === FinishReason.MAX_TOKENS) throw messages.truncated();
        if (
          finish === FinishReason.SAFETY ||
          finish === FinishReason.PROHIBITED_CONTENT ||
          finish === FinishReason.BLOCKLIST ||
          finish === FinishReason.SPII ||
          finish === FinishReason.RECITATION
        ) {
          throw messages.refused('google');
        }
        const usage = response.usageMetadata;
        return finishOutput(params.format, parseJsonText(response.text), {
          inputTokens: usage?.promptTokenCount ?? 0,
          // O raciocínio é cobrado como saída.
          outputTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
        });
      });
    },

    estimate(params: OrganizeParams) {
      return guard(async () => {
        const request = prepareRequest(params.format, params.text);
        // A contagem pela API do Gemini não leva instrução de sistema: conta tudo junto.
        const count = await client.models.countTokens({
          model: params.model,
          contents: `${request.system}\n\n${request.user}`,
        });
        return buildEstimate({
          provider: 'google',
          model: params.model,
          format: params.format,
          effort: params.effort,
          inputTokens: count.totalTokens ?? 0,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
        });
      });
    },
  };
}

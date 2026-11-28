import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { AiModel } from '@trama/core';
import { ANTHROPIC_EFFORT } from './effort';
import { AiError, messages } from './errors';
import { buildEstimate } from './estimate';
import {
  finishOutput,
  MAX_OUTPUT_TOKENS,
  parseJsonText,
  prepareRequest,
  type PreparedRequest,
} from './organize';
import type { AiProvider, OrganizeParams, ProviderOptions } from './types';

/** O Claude sai da lista da conta: no máximo esta quantidade de modelos. */
const MODELS_LIMIT = 100;

/** Erros tipados do SDK viram `AiError`; nunca se compara o texto da mensagem. */
function toAiError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return messages.keyRejected('anthropic');
  }
  if (error instanceof Anthropic.RateLimitError) return messages.rateLimited('anthropic');
  if (error instanceof Anthropic.NotFoundError || error instanceof Anthropic.BadRequestError) {
    return messages.unusableModel('anthropic');
  }
  if (error instanceof Anthropic.APIError) return messages.other('anthropic');
  throw error;
}

/**
 * Claude, com o SDK oficial. A chave é da pessoa e o cliente nasce por pedido. O esforço vai
 * sempre em `output_config.effort`. Não se manda `thinking` (nos modelos 5.5 o raciocínio é
 * adaptativo por padrão, e `disabled` ou `budget_tokens` dão erro 400), nem `temperature`,
 * `top_p` ou `top_k` (400), nem resposta pré-preenchida do assistente (400).
 */
export function createAnthropicProvider(apiKey: string, options: ProviderOptions = {}): AiProvider {
  const client = new Anthropic({
    apiKey,
    maxRetries: 1,
    timeout: 100_000,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });

  async function guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      throw toAiError(error);
    }
  }

  const messagesOf = (request: PreparedRequest) => [
    { role: 'user' as const, content: request.user },
  ];

  return {
    id: 'anthropic',

    listModels() {
      return guard(async () => {
        const models: AiModel[] = [];
        // O SDK pagina sozinho; só os modelos que ainda estão no ar.
        for await (const model of client.models.list({ limit: MODELS_LIMIT })) {
          if (model.lifecycle === 'retired') continue;
          models.push({
            id: model.id,
            name: model.display_name || model.id,
            maxInputTokens: model.max_input_tokens,
            maxOutputTokens: model.max_tokens,
          });
          if (models.length >= MODELS_LIMIT) break;
        }
        return models;
      });
    },

    organize(params: OrganizeParams) {
      return guard(async () => {
        const request = prepareRequest(params.format, params.text);
        const message = await client.messages.create({
          model: params.model,
          max_tokens: MAX_OUTPUT_TOKENS,
          system: request.system,
          messages: messagesOf(request),
          output_config: {
            effort: ANTHROPIC_EFFORT[params.effort],
            // O mesmo esquema do core; quem confere a saída de verdade é o `finishOutput`.
            format: { type: 'json_schema', schema: zodOutputFormat(request.schema).schema },
          },
        });
        if (message.stop_reason === 'refusal') throw messages.refused('anthropic');
        if (message.stop_reason === 'max_tokens') throw messages.truncated();
        const text = message.content.find((block) => block.type === 'text');
        return finishOutput(
          params.format,
          parseJsonText(text?.type === 'text' ? text.text : null),
          { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
        );
      });
    },

    estimate(params: OrganizeParams) {
      return guard(async () => {
        const request = prepareRequest(params.format, params.text);
        const count = await client.messages.countTokens({
          model: params.model,
          system: request.system,
          messages: messagesOf(request),
        });
        return buildEstimate({
          provider: 'anthropic',
          model: params.model,
          format: params.format,
          effort: params.effort,
          inputTokens: count.input_tokens,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
        });
      });
    },
  };
}

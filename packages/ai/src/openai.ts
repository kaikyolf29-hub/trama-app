import type { AiModel } from '@trama/core';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { OPENAI_EFFORT, openaiSupportsReasoning } from './effort';
import { AiError, messages } from './errors';
import { buildEstimate } from './estimate';
import { finishOutput, MAX_OUTPUT_TOKENS, parseJsonText, prepareRequest } from './organize';
import type { AiProvider, OrganizeParams, ProviderOptions } from './types';

const MODELS_LIMIT = 100;

/** Da lista de modelos da OpenAI, ficam os de conversa; fora, voz, imagem, vídeo e embeddings. */
const CHAT_MODEL = /^(gpt-|o\d|chatgpt-)/;
const NOT_FOR_TEXT =
  /(audio|realtime|transcribe|tts|image|search|instruct|embedding|moderation|whisper|dall-e|sora|codex|diarize|computer-use)/;

/**
 * ChatGPT, com o SDK oficial (`openai`), pela API de Respostas. A saída segue o esquema do
 * core (`text.format` com `json_schema` estrito). O esforço vai em `reasoning.effort` nos
 * modelos de raciocínio. `store: false` para a OpenAI não guardar o texto da pessoa.
 */
export function createOpenAiProvider(apiKey: string, options: ProviderOptions = {}): AiProvider {
  const client = new OpenAI({
    apiKey,
    maxRetries: 1,
    timeout: 100_000,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });

  async function guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof AiError) throw error;
      if (
        error instanceof OpenAI.AuthenticationError ||
        error instanceof OpenAI.PermissionDeniedError
      ) {
        throw messages.keyRejected('openai');
      }
      if (error instanceof OpenAI.RateLimitError) throw messages.rateLimited('openai');
      if (error instanceof OpenAI.NotFoundError || error instanceof OpenAI.BadRequestError) {
        throw messages.unusableModel('openai');
      }
      if (error instanceof OpenAI.APIError) throw messages.other('openai');
      throw error;
    }
  }

  return {
    id: 'openai',

    listModels() {
      return guard(async () => {
        const found: { model: AiModel; created: number }[] = [];
        for await (const model of client.models.list()) {
          if (!CHAT_MODEL.test(model.id) || NOT_FOR_TEXT.test(model.id)) continue;
          // A OpenAI não informa nome nem limites: o nome é o próprio id.
          found.push({
            model: { id: model.id, name: model.id, maxInputTokens: null, maxOutputTokens: null },
            created: model.created,
          });
        }
        // Os mais novos primeiro.
        return found
          .sort((a, b) => b.created - a.created)
          .slice(0, MODELS_LIMIT)
          .map((item) => item.model);
      });
    },

    organize(params: OrganizeParams) {
      return guard(async () => {
        const request = prepareRequest(params.format, params.text);
        const { schema } = zodTextFormat(request.schema, request.schemaName);
        const response = await client.responses.create({
          model: params.model,
          instructions: request.system,
          input: request.user,
          max_output_tokens: MAX_OUTPUT_TOKENS,
          store: false,
          text: { format: { type: 'json_schema', name: request.schemaName, strict: true, schema } },
          ...(openaiSupportsReasoning(params.model)
            ? { reasoning: { effort: OPENAI_EFFORT[params.effort] } }
            : {}),
        });
        if (response.status === 'incomplete') {
          const reason = response.incomplete_details?.reason;
          throw reason === 'content_filter' ? messages.refused('openai') : messages.truncated();
        }
        const refused = response.output.some(
          (item) => item.type === 'message' && item.content.some((part) => part.type === 'refusal'),
        );
        if (refused) throw messages.refused('openai');
        return finishOutput(params.format, parseJsonText(response.output_text), {
          inputTokens: response.usage?.input_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
        });
      });
    },

    estimate(params: OrganizeParams) {
      return guard(async () => {
        const request = prepareRequest(params.format, params.text);
        const count = await client.responses.inputTokens.count({
          model: params.model,
          instructions: request.system,
          input: request.user,
        });
        return buildEstimate({
          provider: 'openai',
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

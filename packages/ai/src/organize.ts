import {
  aiFlowOutputSchema,
  aiPromptOutputSchema,
  aiScriptOutputSchema,
  type AiFlowOutput,
  type AiOrganizeFormat,
  type AiPromptOutput,
  type AiScriptOutput,
  type AiUsage,
} from '@trama/core';
import { z } from 'zod';
import { ORGANIZE_PROMPTS, wrapSpeech } from '../prompts';
import { messages } from './errors';
import type { OrganizeResult } from './types';

/** Tokens de saída que cada pedido pode usar (raciocínio incluído). */
export const MAX_OUTPUT_TOKENS = 16_000;

/** O pedido montado, igual para os três provedores: o que muda é só como cada SDK o envia. */
export interface PreparedRequest {
  /** Instruções fixas do formato (prompt versionado). */
  system: string;
  /** A fala da pessoa, dentro das tags que a separam das instruções. */
  user: string;
  /** Esquema da saída (o do core), em zod. */
  schema: z.ZodType;
  /** Nome do esquema, para os provedores que pedem um. */
  schemaName: string;
}

export function prepareRequest(format: AiOrganizeFormat, text: string): PreparedRequest {
  const prompt = ORGANIZE_PROMPTS[format];
  return {
    system: prompt.system,
    user: wrapSpeech(text),
    schema: SCHEMAS[format],
    schemaName: SCHEMA_NAMES[format],
  };
}

const SCHEMAS = {
  flow: aiFlowOutputSchema,
  plan: aiFlowOutputSchema,
  script: aiScriptOutputSchema,
  prompt: aiPromptOutputSchema,
} as const satisfies Record<AiOrganizeFormat, z.ZodType>;

const SCHEMA_NAMES = {
  flow: 'trama_fluxo',
  plan: 'trama_fluxo',
  script: 'trama_roteiro',
  prompt: 'trama_prompt',
} as const satisfies Record<AiOrganizeFormat, string>;

/**
 * Valida a saída com o esquema do core, de novo, venha de onde vier (o provedor já tentou
 * seguir o esquema, mas só o core garante as ligações entre as partes).
 */
export function finishOutput(
  format: AiOrganizeFormat,
  raw: unknown,
  usage: AiUsage,
): OrganizeResult {
  if (format === 'prompt') {
    const parsed = aiPromptOutputSchema.safeParse(raw);
    if (!parsed.success) throw messages.badOutput();
    return { format, output: parsed.data satisfies AiPromptOutput, usage };
  }
  if (format === 'script') {
    const parsed = aiScriptOutputSchema.safeParse(raw);
    if (!parsed.success) throw messages.badOutput();
    return { format, output: parsed.data satisfies AiScriptOutput, usage };
  }
  const parsed = aiFlowOutputSchema.safeParse(raw);
  if (!parsed.success) throw messages.badOutput();
  return { format, output: parsed.data satisfies AiFlowOutput, usage };
}

/** O texto da resposta como JSON; texto vazio ou quebrado é uma saída fora do formato. */
export function parseJsonText(text: string | null | undefined): unknown {
  if (!text) throw messages.badOutput();
  try {
    return JSON.parse(text);
  } catch {
    throw messages.badOutput();
  }
}

/**
 * O esquema de saída em JSON Schema puro, para o Gemini. O zod emite `oneOf` nas uniões com
 * discriminante; os provedores aceitam `anyOf`, que aqui significa a mesma coisa (só um ramo
 * casa, por causa do campo `type`).
 */
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io: 'output' }) as Record<string, unknown>;
  const { $schema: _version, ...rest } = json;
  return renameOneOf(rest) as Record<string, unknown>;
}

function renameOneOf(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(renameOneOf);
  if (node && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node).map(([key, value]) => [
        key === 'oneOf' ? 'anyOf' : key,
        renameOneOf(value),
      ]),
    );
  }
  return node;
}

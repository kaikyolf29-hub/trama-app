import { z } from 'zod';
import { apiErrorSchema } from './api';
import { noteColorSchema, shapeKindSchema, textColorSchema } from './blocks';
import { dateTimeSchema } from './status';

/**
 * IA (etapa 3.1, docs/PLAN.md, "IA: voz local e organização por API"): as preferências da pessoa,
 * o resumo das chaves guardadas, o pedido de "organizar" e a saída que a IA devolve. O código
 * que fala com cada provedor mora em `packages/ai`, e só o Worker da API o usa; aqui fica o que
 * o site, a API e o MCP compartilham. A chave de verdade nunca aparece neste contrato: só o
 * resumo dela.
 */

/** Os três provedores. Cada pessoa usa a própria chave (e paga o próprio uso). */
export const aiProviderSchema = z.enum(['anthropic', 'google', 'openai']);
export type AiProvider = z.infer<typeof aiProviderSchema>;

/** Nome que a tela usa para cada provedor. */
export const aiProviderLabels: Record<AiProvider, string> = {
  anthropic: 'Claude (Anthropic)',
  google: 'Gemini (Google)',
  openai: 'ChatGPT (OpenAI)',
};

/** Esforço da tela: o `packages/ai` traduz para o parâmetro de cada provedor. */
export const aiEffortSchema = z.enum(['fast', 'balanced', 'thorough']);
export type AiEffort = z.infer<typeof aiEffortSchema>;

export const aiEffortLabels: Record<AiEffort, string> = {
  fast: 'Rápido',
  balanced: 'Equilibrado',
  thorough: 'Caprichado',
};

/** Uma frase sobre custo e tempo, para a pessoa escolher sem saber o que é "esforço". */
export const aiEffortHints: Record<AiEffort, string> = {
  fast: 'Responde logo e gasta menos. Bom para falas curtas e claras.',
  balanced: 'O ponto médio: pensa um pouco antes de responder. Serve para quase tudo.',
  thorough: 'Pensa mais e gasta mais. Bom para falas longas ou confusas.',
};

export const DEFAULT_AI_EFFORT: AiEffort = 'balanced';

/** Sugestões de modelo do Claude (a lista de verdade vem da API da conta da pessoa). */
export const AI_MODEL_SUGGESTIONS: Partial<
  Record<AiProvider, readonly { id: string; hint: string }[]>
> = {
  anthropic: [
    { id: 'claude-haiku-5-5', hint: 'Para o dia a dia' },
    { id: 'claude-sonnet-5-5', hint: 'Equilíbrio entre custo e qualidade' },
    { id: 'claude-opus-5-5', hint: 'O máximo de qualidade' },
  ],
};

/** Nome de modelo como os provedores escrevem (ex.: `claude-haiku-5-5`, `gemini-…`, `gpt-…`). */
export const aiModelIdSchema = z
  .string()
  .trim()
  .min(1, 'Escolha um modelo.')
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/, 'Nome de modelo inválido.');

/** O que a pessoa escolheu em Configurações → IA. */
export const aiSettingsSchema = z.object({
  provider: aiProviderSchema,
  model: aiModelIdSchema,
  effort: aiEffortSchema,
});
export type AiSettings = z.infer<typeof aiSettingsSchema>;

/** `GET /ai/settings`: `null` até a pessoa salvar a primeira escolha. */
export const aiSettingsResponseSchema = z.object({ settings: aiSettingsSchema.nullable() });

/**
 * A chave que a pessoa cola: texto visível, sem espaços, de 8 a 512 caracteres. Cada provedor
 * tem o próprio formato; quem confere de verdade é o provedor, antes de a API guardá-la.
 */
export const aiApiKeySchema = z
  .string()
  .trim()
  .min(8, 'A chave está curta demais.')
  .max(512, 'A chave está longa demais.')
  .regex(/^[!-~]+$/, 'A chave não pode ter espaços nem letras acentuadas.');

/** `PUT /ai/keys/:provider`. */
export const saveAiKeyRequestSchema = z.object({ apiKey: aiApiKeySchema });
export type SaveAiKeyRequest = z.infer<typeof saveAiKeyRequestSchema>;

/** Os 4 últimos caracteres da chave: é tudo o que a tela mostra ("termina em 1234"). */
export function aiKeyLast4(apiKey: string): string {
  return apiKey.slice(-4);
}

/** O resumo de uma chave guardada. Nunca leva a chave. */
export const aiKeySummarySchema = z.object({
  provider: aiProviderSchema,
  last4: z.string().length(4),
  /** Quando a chave foi guardada (ou trocada). */
  savedAt: dateTimeSchema,
});
export type AiKeySummary = z.infer<typeof aiKeySummarySchema>;

/** `GET /ai/keys`: um resumo por provedor que a pessoa configurou. */
export const aiKeysResponseSchema = z.object({ keys: z.array(aiKeySummarySchema) });

/** Um modelo da lista que o provedor devolveu para a conta da pessoa. */
export const aiModelSchema = z.object({
  id: aiModelIdSchema,
  /** Nome para mostrar (o id, quando o provedor não dá outro). */
  name: z.string().min(1),
  maxInputTokens: z.number().int().positive().nullable(),
  maxOutputTokens: z.number().int().positive().nullable(),
});
export type AiModel = z.infer<typeof aiModelSchema>;

/** `GET /ai/models/:provider`. */
export const aiModelsResponseSchema = z.object({ models: z.array(aiModelSchema) });

/* -------------------------------------------------------------------------------------------- */
/* Organizar                                                                                     */
/* -------------------------------------------------------------------------------------------- */

/**
 * Formatos de saída: fluxo, plano com tarefas e prompt organizado. O roteiro entra quando o
 * formato de roteiro da etapa 2.1 chegar ao core.
 */
export const aiOrganizeFormatSchema = z.enum(['flow', 'plan', 'prompt']);
export type AiOrganizeFormat = z.infer<typeof aiOrganizeFormatSchema>;

export const aiOrganizeFormatLabels: Record<AiOrganizeFormat, string> = {
  flow: 'Fluxo',
  plan: 'Plano com tarefas',
  prompt: 'Prompt organizado',
};

/** Tamanho máximo do texto falado: 20 mil caracteres (uns 3 mil palavras, mais de 20 minutos). */
export const AI_TEXT_MAX = 20_000;

/** `POST /ai/organize` e `POST /ai/estimate`: o provedor e o modelo vêm das preferências salvas. */
export const aiOrganizeRequestSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, 'Escreva ou fale alguma coisa antes.')
    .max(AI_TEXT_MAX, `Use no máximo ${AI_TEXT_MAX.toLocaleString('pt-BR')} caracteres.`),
  format: aiOrganizeFormatSchema,
});
export type AiOrganizeRequest = z.infer<typeof aiOrganizeRequestSchema>;

/* Saída da IA. Todo campo é obrigatório e "não tem" é `null`: é o que os três provedores
 * aceitam como esquema de saída estruturada. Sem posições: o layout automático é da etapa 3.3. */

/** Nome interno de um bloco ou grupo na saída ("b1", "g1"); só existe dentro desta resposta. */
const aiRefSchema = z.string().min(1).max(64);

/** Texto solto: título (serifa, forte) ou corpo. */
export const aiTextBlockSchema = z.object({
  type: z.literal('text'),
  ref: aiRefSchema,
  text: z.string(),
  style: z.enum(['title', 'body']),
  color: textColorSchema,
});

/** Cartão: etiqueta curta, título e descrição. */
export const aiCardBlockSchema = z.object({
  type: z.literal('card'),
  ref: aiRefSchema,
  title: z.string(),
  description: z.string().nullable(),
  tag: z.string().nullable(),
});

export const aiStickyBlockSchema = z.object({
  type: z.literal('sticky'),
  ref: aiRefSchema,
  text: z.string(),
  color: noteColorSchema,
});

export const aiShapeBlockSchema = z.object({
  type: z.literal('shape'),
  ref: aiRefSchema,
  shape: shapeKindSchema,
  text: z.string(),
});

/** Etapas (lista com marcar), todas desmarcadas. */
export const aiChecklistBlockSchema = z.object({
  type: z.literal('checklist'),
  ref: aiRefSchema,
  title: z.string(),
  items: z.array(z.string()).max(40),
});

export const aiBlockSchema = z.discriminatedUnion('type', [
  aiTextBlockSchema,
  aiCardBlockSchema,
  aiStickyBlockSchema,
  aiShapeBlockSchema,
  aiChecklistBlockSchema,
]);
export type AiBlock = z.infer<typeof aiBlockSchema>;

/** Grupo: vira uma moldura com os blocos dentro. */
export const aiGroupSchema = z.object({
  ref: aiRefSchema,
  title: z.string(),
  blockRefs: z.array(aiRefSchema).min(1),
});
export type AiGroup = z.infer<typeof aiGroupSchema>;

/** Ligação: vira uma seta. `from` e `to` são `ref` de bloco ou de grupo. */
export const aiLinkSchema = z.object({
  from: aiRefSchema,
  to: aiRefSchema,
  label: z.string().nullable(),
});
export type AiLink = z.infer<typeof aiLinkSchema>;

/** Algo que a IA percebeu e corrigiu na fala ("raposa" virou "gato"). */
export const aiCorrectionSchema = z.object({ from: z.string(), to: z.string() });
export type AiCorrection = z.infer<typeof aiCorrectionSchema>;

export const AI_LIMITS = { blocks: 80, groups: 20, links: 150, corrections: 50, sections: 12 };

const aiFlowOutputShape = z.object({
  /** Sugestão de título do projeto. */
  title: z.string(),
  blocks: z.array(aiBlockSchema).min(1).max(AI_LIMITS.blocks),
  groups: z.array(aiGroupSchema).max(AI_LIMITS.groups),
  links: z.array(aiLinkSchema).max(AI_LIMITS.links),
  corrections: z.array(aiCorrectionSchema).max(AI_LIMITS.corrections),
});

/**
 * Saída de "organizar" para fluxo e plano. Além do formato, confere as ligações entre as partes:
 * nome repetido, ligação ou grupo apontando para algo que não existe, bloco em dois grupos.
 */
export const aiFlowOutputSchema = aiFlowOutputShape.superRefine((output, ctx) => {
  const issue = (message: string, path: (string | number)[]) =>
    ctx.addIssue({ code: 'custom', message, path });

  const refs = new Set<string>();
  const claim = (ref: string, path: (string | number)[]) => {
    if (refs.has(ref)) issue(`nome repetido: ${ref}`, path);
    refs.add(ref);
  };
  output.blocks.forEach((block, i) => claim(block.ref, ['blocks', i, 'ref']));
  const blockRefs = new Set(refs);
  output.groups.forEach((group, i) => claim(group.ref, ['groups', i, 'ref']));

  const grouped = new Set<string>();
  output.groups.forEach((group, i) => {
    group.blockRefs.forEach((ref, j) => {
      const path = ['groups', i, 'blockRefs', j];
      if (!blockRefs.has(ref)) issue(`o grupo aponta para um bloco que não existe: ${ref}`, path);
      else if (grouped.has(ref)) issue(`o bloco ${ref} está em mais de um grupo`, path);
      grouped.add(ref);
    });
  });

  output.links.forEach((link, i) => {
    for (const end of ['from', 'to'] as const) {
      if (!refs.has(link[end])) {
        issue(`a ligação aponta para algo que não existe: ${link[end]}`, ['links', i, end]);
      }
    }
  });
});
export type AiFlowOutput = z.infer<typeof aiFlowOutputSchema>;

/** Uma parte do prompt organizado: "Objetivo", "Contexto", "Instruções", "Exemplos"… */
export const aiPromptSectionSchema = z.object({ heading: z.string(), content: z.string() });
export type AiPromptSection = z.infer<typeof aiPromptSectionSchema>;

/** Saída de "organizar" para prompt. */
export const aiPromptOutputSchema = z.object({
  title: z.string(),
  sections: z.array(aiPromptSectionSchema).min(1).max(AI_LIMITS.sections),
  corrections: z.array(aiCorrectionSchema).max(AI_LIMITS.corrections),
});
export type AiPromptOutput = z.infer<typeof aiPromptOutputSchema>;

/** O prompt pronto para copiar: cada seção com o título em destaque. */
export function promptOutputToText(output: AiPromptOutput): string {
  return output.sections
    .map((section) => `## ${section.heading.trim()}\n\n${section.content.trim()}`)
    .join('\n\n');
}

/** O uso que o provedor contou (tokens), para a pessoa saber o que gastou. */
export const aiUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
});
export type AiUsage = z.infer<typeof aiUsageSchema>;

const organizeResultBase = {
  provider: aiProviderSchema,
  model: z.string().min(1),
  usage: aiUsageSchema,
};

/** `POST /ai/organize`: a saída já validada com os esquemas acima. */
export const aiOrganizeResponseSchema = z.discriminatedUnion('format', [
  z.object({
    ...organizeResultBase,
    format: z.literal(['flow', 'plan']),
    output: aiFlowOutputSchema,
  }),
  z.object({ ...organizeResultBase, format: z.literal('prompt'), output: aiPromptOutputSchema }),
]);
export type AiOrganizeResponse = z.infer<typeof aiOrganizeResponseSchema>;

/**
 * `POST /ai/estimate`: antes de enviar, quanto vai custar, mais ou menos. `outputTokens` é uma
 * previsão (a resposta ainda não existe) e `costUsd` é `null` quando o Trama não conhece o
 * preço do modelo. Quem cobra é o provedor, na conta da pessoa.
 */
export const aiEstimateResponseSchema = z.object({
  provider: aiProviderSchema,
  model: z.string().min(1),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative().nullable(),
});
export type AiEstimateResponse = z.infer<typeof aiEstimateResponseSchema>;

/* Erros */

/** O que deu errado, para a tela escolher a mensagem e o botão certos. */
export const aiErrorCodeSchema = z.enum([
  /** A API ainda não tem a chave de criptografia (TOKEN_ENCRYPTION_KEY). */
  'not_configured',
  /** A pessoa ainda não guardou uma chave deste provedor. */
  'no_key',
  /** A pessoa ainda não escolheu provedor e modelo em Configurações → IA. */
  'no_settings',
  /** O provedor recusou a chave. */
  'key_rejected',
  /** O provedor pediu para esperar (limite de uso da conta da pessoa). */
  'provider_rate_limited',
  /** Pedidos demais por minuto ao Trama. */
  'too_many_requests',
  /** O modelo se recusou a responder. */
  'refused',
  /** A resposta passou do tamanho máximo e veio cortada. */
  'truncated',
  /** A resposta não seguiu o formato. */
  'bad_output',
  /** Qualquer outro erro do provedor. */
  'provider_error',
]);
export type AiErrorCode = z.infer<typeof aiErrorCodeSchema>;

/** Corpo de erro das rotas de IA: a frase de sempre (`error`) e o motivo (`code`). */
export const aiErrorBodySchema = apiErrorSchema.extend({ code: aiErrorCodeSchema.optional() });
export type AiErrorBody = z.infer<typeof aiErrorBodySchema>;

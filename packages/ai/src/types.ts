import type {
  AiEffort,
  AiFlowOutput,
  AiModel,
  AiOrganizeFormat,
  AiPromptOutput,
  AiScriptOutput,
  AiProvider as AiProviderId,
  AiUsage,
} from '@trama/core';

/** O que `organize` e `estimate` recebem: o texto já validado pelo core e a escolha da pessoa. */
export interface OrganizeParams {
  model: string;
  effort: AiEffort;
  format: AiOrganizeFormat;
  text: string;
}

/** A saída da IA já validada com os esquemas do core, mais o uso que o provedor contou. */
export type OrganizeResult =
  | { format: 'flow' | 'plan'; output: AiFlowOutput; usage: AiUsage }
  | { format: 'script'; output: AiScriptOutput; usage: AiUsage }
  | { format: 'prompt'; output: AiPromptOutput; usage: AiUsage };

/** Estimativa antes de enviar. `costUsd` é `null` quando o preço do modelo não é conhecido. */
export interface Estimate {
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
}

/**
 * Um provedor de IA com a chave de uma pessoa. Cada implementação usa o SDK oficial do provedor
 * e traduz o esforço da tela (Rápido, Equilibrado, Caprichado) para o parâmetro dele. Só o Worker
 * da API usa este pacote: a chave nunca chega ao navegador.
 */
export interface AiProvider {
  readonly id: AiProviderId;
  /** Os modelos que a conta da pessoa pode usar. Com a chave errada, falha com `key_rejected`. */
  listModels(): Promise<AiModel[]>;
  /** Organiza a fala. Erros viram `AiError`, com uma frase em português. */
  organize(params: OrganizeParams): Promise<OrganizeResult>;
  /** Conta os tokens do pedido e estima o custo. */
  estimate(params: OrganizeParams): Promise<Estimate>;
}

/** Opções para trocar a rede nos testes (um `fetch` falso). */
export interface ProviderOptions {
  fetch?: typeof fetch;
}

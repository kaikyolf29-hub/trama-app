import {
  aiEffortLabels,
  type AiEstimateResponse,
  type AiErrorCode,
  type AiOrganizeFormat,
  type AiProvider,
  type AiSettings,
} from '@trama/core';

/**
 * Peças puras da organização pela IA na tela "Falar e organizar" (etapa 3.3): nomes, texto da
 * estimativa de custo e que erro pede qual botão. Nada aqui fala com a rede nem com o React.
 */

/** Nome curto do provedor, como na tela 5 ("Organizar com Claude"). */
export const providerShortName: Record<AiProvider, string> = {
  anthropic: 'Claude',
  google: 'Gemini',
  openai: 'ChatGPT',
};

/** Os formatos, na ordem da tela 5. */
export const FORMAT_ORDER = [
  'flow',
  'script',
  'plan',
  'prompt',
] as const satisfies readonly AiOrganizeFormat[];

/** O que cada formato entrega, em uma frase (dica do botão e do texto vazio). */
export const formatHints: Record<AiOrganizeFormat, string> = {
  flow: 'Blocos ligados por setas, no quadro.',
  script: 'Um roteiro com cenas, fala e B-roll.',
  plan: 'Etapas e tarefas, em molduras no quadro.',
  prompt: 'Um prompt pronto para colar em outra IA.',
};

/** O botão principal de cada formato quando o resultado está pronto. */
export const insertLabels: Record<AiOrganizeFormat, string> = {
  flow: 'Inserir no quadro',
  plan: 'Inserir no quadro',
  script: 'Criar roteiro',
  prompt: 'Copiar prompt',
};

/** "o Claude (claude-haiku-5-5), esforço Equilibrado" */
export function settingsLine(settings: AiSettings): string {
  return `${providerShortName[settings.provider]} · ${settings.model}`;
}

export function effortLine(settings: AiSettings): string {
  return `Esforço ${aiEffortLabels[settings.effort].toLowerCase()}`;
}

const usd = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' });
const count = new Intl.NumberFormat('pt-BR');

/** "menos de US$ 0,01", "US$ 0,12". */
export function formatCost(costUsd: number): string {
  return costUsd < 0.005 ? `menos de ${usd.format(0.01)}` : usd.format(costUsd);
}

/**
 * A frase da estimativa, antes de enviar. O custo é do provedor, na conta da pessoa: o Trama só
 * mostra a conta aproximada. Sem preço conhecido (Gemini, ChatGPT), mostra só os tokens.
 */
export function estimateText(estimate: AiEstimateResponse): string {
  const tokens = `cerca de ${count.format(estimate.inputTokens)} tokens para enviar e ${count.format(estimate.outputTokens)} de resposta`;
  if (estimate.costUsd === null) {
    return `${tokens}. O Trama não sabe o preço deste modelo: confira no site do provedor.`;
  }
  return `${tokens}, uns ${formatCost(estimate.costUsd)} na sua conta do ${providerShortName[estimate.provider]}.`;
}

/** Erros que se resolvem em Configurações → IA. */
const SETTINGS_ERRORS: readonly AiErrorCode[] = [
  'not_configured',
  'no_key',
  'no_settings',
  'key_rejected',
];

export function needsSettings(code: AiErrorCode | undefined): boolean {
  return code !== undefined && SETTINGS_ERRORS.includes(code);
}

/** Vale tentar de novo sem mudar nada? (limite de uso e erros passageiros, sim; chave, não.) */
export function canRetry(code: AiErrorCode | undefined): boolean {
  return (
    code === undefined ||
    !['not_configured', 'no_key', 'no_settings', 'key_rejected', 'refused'].includes(code)
  );
}

/** O título do quadro depois de organizar: "Sem título" vira o nome que a IA sugeriu. */
export function shouldRename(currentTitle: string): boolean {
  return currentTitle.trim() === '' || currentTitle.trim() === 'Sem título';
}

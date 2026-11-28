import type { AiOrganizeFormat } from '@trama/core';
import { flowPrompt } from './flow.v1';
import { planPrompt } from './plan.v1';
import { promptPrompt } from './prompt.v1';
import { scriptPrompt } from './script.v1';

export { wrapSpeech, type OrganizePrompt } from './shared';
export { flowPrompt, planPrompt, promptPrompt, scriptPrompt };

/** O prompt em uso de cada formato. Para trocar a versão, aponte para o arquivo novo. */
export const ORGANIZE_PROMPTS = {
  flow: flowPrompt,
  script: scriptPrompt,
  plan: planPrompt,
  prompt: promptPrompt,
} as const satisfies Record<AiOrganizeFormat, unknown>;

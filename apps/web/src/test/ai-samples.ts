import type {
  AiEstimateResponse,
  AiFlowOutput,
  AiOrganizeResponse,
  AiPromptOutput,
  AiScriptOutput,
} from '@trama/core';

/**
 * Respostas de IA de mentira (as da tela 5, "O gato sem memória"), para os testes de tela e os
 * de ponta a ponta. Sem Vitest aqui: o Playwright também importa este arquivo.
 */

const card = (ref: string, title: string, tag: string | null = null) =>
  ({ type: 'card', ref, title, description: null, tag }) as const;

export const sampleFlowOutput: AiFlowOutput = {
  title: 'O gato sem memória',
  blocks: [
    card('b0', 'Jogo de plataforma — “O gato sem memória”', 'ideia principal'),
    card('b1', 'Gato perdeu a memória'),
    card('b2', 'Cada fase = uma lembrança'),
    card('b3', 'Chefe final: o dono'),
    card('b4', 'Plataforma 2D'),
    card('b5', 'Pulo na parede'),
    card('b6', 'Menu'),
    card('b7', 'Música (lo-fi?)'),
  ],
  groups: [
    { ref: 'g1', title: 'História', blockRefs: ['b1', 'b2', 'b3'] },
    { ref: 'g2', title: 'Mecânicas', blockRefs: ['b4', 'b5'] },
    { ref: 'g3', title: 'A decidir', blockRefs: ['b6', 'b7'] },
  ],
  links: [
    { from: 'b0', to: 'g1', label: null },
    { from: 'b0', to: 'g2', label: null },
    { from: 'b0', to: 'g3', label: null },
  ],
  corrections: [{ from: 'raposa', to: 'gato' }],
};

export const sampleScriptOutput: AiScriptOutput = {
  title: 'O gato sem memória: apresentando o jogo',
  targetDuration: '8 min',
  scenes: [
    {
      title: 'Gancho',
      time: null,
      narration: 'E se você acordasse sem lembrar de nada?',
      broll: ['Gato na janela', 'Close nos olhos do gato'],
      notes: null,
    },
    {
      title: 'A história',
      time: null,
      narration: 'Cada fase do jogo é uma lembrança do gato.',
      broll: ['Trechos do jogo rodando'],
      notes: 'Música calma por baixo.',
    },
  ],
  corrections: [{ from: 'raposa', to: 'gato' }],
};

export const samplePromptOutput: AiPromptOutput = {
  title: 'Roteiros de vídeos de receitas rápidas',
  sections: [
    { heading: 'Objetivo', content: 'Escrever o roteiro de um vídeo de culinária.' },
    { heading: 'Contexto', content: 'Canal de receitas rápidas, tom leve.' },
  ],
  corrections: [],
};

const base = {
  provider: 'anthropic',
  model: 'claude-haiku-5-5',
  usage: { inputTokens: 900, outputTokens: 1500 },
} as const;

export const sampleResponses = {
  flow: { ...base, format: 'flow', output: sampleFlowOutput },
  plan: { ...base, format: 'plan', output: sampleFlowOutput },
  script: { ...base, format: 'script', output: sampleScriptOutput },
  prompt: { ...base, format: 'prompt', output: samplePromptOutput },
} as const satisfies Record<string, AiOrganizeResponse>;

export const sampleEstimate: AiEstimateResponse = {
  provider: 'anthropic',
  model: 'claude-haiku-5-5',
  inputTokens: 900,
  outputTokens: 1500,
  costUsd: 0.0123,
};

import type { FlowContentInput } from '../flow';

/**
 * Modelo "Falar e organizar". A gravação e a IA chegam numa próxima etapa (docs/PLAN.md, tela 5);
 * por enquanto o modelo abre um quadro em branco com uma nota que explica isso. A moldura vazia
 * "Seu fluxo" marca onde montar e dá ao quadro um tamanho que não abre com zoom exagerado.
 */
export const voiceTemplateContent = {
  schemaVersion: 1,
  frames: [
    {
      id: 'moldura-fluxo',
      title: 'Seu fluxo',
      position: { x: 480, y: 96 },
      size: { width: 560, height: 344 },
    },
  ],
  blocks: [
    {
      id: 'nota-voz',
      type: 'sticky',
      position: { x: 112, y: 96 },
      size: { width: 320, height: 152 },
      text: 'Falar e organizar chega numa próxima etapa. Por enquanto, monte o fluxo aqui no quadro; quando a voz chegar, é só falar e a IA organiza.',
      color: 'blue',
    },
  ],
} satisfies FlowContentInput;

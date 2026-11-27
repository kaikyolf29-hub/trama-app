import type { FlowContentInput } from '../flow';

/**
 * Modelo "Roteiro de vídeo", na versão em quadro: cada cena é um cartão, as cenas vão em
 * sequência (ligadas por setas) e, embaixo de cada uma, há uma nota para a fala e outra para o
 * B-roll. Os roteiros em texto, com falas e B-roll ligados ao fluxo, são da V1 (docs/PLAN.md).
 * Posições e tamanhos na grade de 8 px.
 */
const SCENES = [
  { id: 'gancho', title: 'Gancho', description: 'O que prende nos primeiros 15 segundos' },
  { id: 'desenvolvimento', title: 'Desenvolvimento', description: 'O assunto, em partes curtas' },
  { id: 'exemplo', title: 'Exemplo', description: 'Mostre na prática' },
  { id: 'fechamento', title: 'Fechamento', description: 'Resumo e chamada para a ação' },
] as const;

/** Cada coluna tem 280 px de largura, com 56 px de espaço entre uma e outra. */
const COLUMN_STEP = 336;
const FIRST_X = 112;

const sceneBlocks = SCENES.flatMap((scene, i) => {
  const x = FIRST_X + i * COLUMN_STEP;
  return [
    {
      id: `cena-${scene.id}`,
      type: 'card' as const,
      position: { x, y: 128 },
      size: { width: 280, height: 144 },
      tag: `Cena ${i + 1}`,
      title: scene.title,
      description: scene.description,
    },
    {
      id: `fala-${scene.id}`,
      type: 'sticky' as const,
      position: { x, y: 304 },
      size: { width: 136, height: 104 },
      text: 'Fala',
      color: 'yellow' as const,
    },
    {
      id: `broll-${scene.id}`,
      type: 'sticky' as const,
      position: { x: x + 144, y: 304 },
      size: { width: 136, height: 104 },
      text: 'B-roll',
      color: 'blue' as const,
    },
  ];
});

export const scriptTemplateContent = {
  schemaVersion: 1,
  blocks: [
    {
      id: 'texto-titulo',
      type: 'text',
      position: { x: FIRST_X, y: 48 },
      size: { width: 640, height: 48 },
      text: 'Roteiro · título do vídeo',
      font: 'serif',
      fontSize: 24,
      color: 'strong',
      bold: true,
    },
    ...sceneBlocks,
  ],
  arrows: SCENES.slice(1).map((scene, i) => ({
    id: `seta-${i + 1}`,
    from: { nodeId: `cena-${SCENES[i]?.id ?? ''}`, side: 'right' as const },
    to: { nodeId: `cena-${scene.id}`, side: 'left' as const },
  })),
} satisfies FlowContentInput;

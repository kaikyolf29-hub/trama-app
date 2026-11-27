import type { FlowContentInput } from '../flow';

/**
 * Modelo "Aula por etapas": uma moldura por etapa da aula, em fila, e cada moldura já é um
 * passo do modo aula (os blocos aparecem um de cada vez). Posições na grade de 8 px.
 */
const STAGES = [
  {
    id: 'abertura',
    tag: 'Etapa 1',
    title: 'Abertura',
    description: 'Apresente o tema e o que a turma vai aprender',
    note: 'Pergunta para começar a conversa',
    color: 'yellow',
  },
  {
    id: 'conceito',
    tag: 'Etapa 2',
    title: 'Conceito',
    description: 'Explique a ideia principal com palavras simples',
    note: 'Palavra-chave a destacar',
    color: 'blue',
  },
  {
    id: 'exemplo',
    tag: 'Etapa 3',
    title: 'Exemplo',
    description: 'Mostre um caso real, passo a passo',
    note: 'Cole aqui um link ou uma imagem',
    color: 'green',
  },
  {
    id: 'fechamento',
    tag: 'Etapa 4',
    title: 'Fechamento',
    description: 'Resuma e diga o que fazer depois da aula',
    note: 'Tarefa para casa',
    color: 'pink',
  },
] as const;

/** Cada moldura tem 320 px de largura, com 64 px de espaço entre uma e outra. */
const FRAME_STEP = 384;
const FIRST_X = 112;
const FRAME_Y = 128;

const frames = STAGES.map((stage, i) => ({
  id: `moldura-${stage.id}`,
  title: `${i + 1} · ${stage.title}`,
  position: { x: FIRST_X + i * FRAME_STEP, y: FRAME_Y },
  size: { width: 320, height: 344 },
}));

const stageBlocks = STAGES.flatMap((stage, i) => {
  const x = FIRST_X + i * FRAME_STEP;
  return [
    {
      id: `cartao-${stage.id}`,
      type: 'card' as const,
      frameId: `moldura-${stage.id}`,
      position: { x: x + 32, y: FRAME_Y + 32 },
      size: { width: 256, height: 144 },
      tag: stage.tag,
      title: stage.title,
      description: stage.description,
    },
    {
      id: `nota-${stage.id}`,
      type: 'sticky' as const,
      frameId: `moldura-${stage.id}`,
      position: { x: x + 32, y: FRAME_Y + 208 },
      size: { width: 160, height: 104 },
      text: stage.note,
      color: stage.color,
    },
  ];
});

export const lessonTemplateContent = {
  schemaVersion: 1,
  frames,
  blocks: [
    {
      id: 'texto-titulo',
      type: 'text',
      position: { x: FIRST_X, y: 48 },
      size: { width: 640, height: 48 },
      text: 'Aula · título da aula',
      font: 'serif',
      fontSize: 24,
      color: 'strong',
      bold: true,
    },
    ...stageBlocks,
  ],
  arrows: STAGES.slice(1).map((stage, i) => ({
    id: `seta-${i + 1}`,
    from: { nodeId: `moldura-${STAGES[i]?.id ?? ''}`, side: 'right' as const },
    to: { nodeId: `moldura-${stage.id}`, side: 'left' as const },
  })),
  presentation: STAGES.map((stage) => ({
    id: `passo-${stage.id}`,
    targetIds: [`moldura-${stage.id}`],
    title: stage.title,
  })),
} satisfies FlowContentInput;

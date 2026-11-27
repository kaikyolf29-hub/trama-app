import { flowContentSchema, type FlowContent, type FlowContentInput } from '@trama/core';

const TYPES = ['card', 'sticky', 'text', 'shape', 'checklist', 'link'] as const;

/** Tamanho e espaçamento do teste de desempenho, tudo em múltiplos de 8 px. */
const BLOCK = { width: 160, height: 96 };
const GAP = 24;
const PADDING = 32;
const COLUMNS = 4;
const ROWS = 5;
const PER_FRAME = COLUMNS * ROWS;
const FRAME_GAP = 64;
const FRAME_COLUMNS = 5;

/**
 * Um fluxo grande para medir o desempenho do quadro: `blocks` blocos de tipos variados (cartão,
 * nota, texto, forma, etapas e link), na grade de 8 px, em molduras de 4 x 5, e uma seta ligando
 * cada bloco ao seguinte da mesma moldura (cerca de 1 seta a cada 2 blocos). Sem imagem, vídeo
 * nem áudio: nada aqui faz pedido de rede.
 */
export function bigFlow(blocks = 500): FlowContent {
  const frames: NonNullable<FlowContentInput['frames']> = [];
  const content: NonNullable<FlowContentInput['blocks']> = [];
  const arrows: NonNullable<FlowContentInput['arrows']> = [];

  const frameWidth = PADDING * 2 + COLUMNS * BLOCK.width + (COLUMNS - 1) * GAP;
  const frameHeight = PADDING * 2 + ROWS * BLOCK.height + (ROWS - 1) * GAP;

  for (let index = 0; index < blocks; index++) {
    const frameIndex = Math.floor(index / PER_FRAME);
    const slot = index % PER_FRAME;
    const frameX = (frameIndex % FRAME_COLUMNS) * (frameWidth + FRAME_GAP);
    const frameY = Math.floor(frameIndex / FRAME_COLUMNS) * (frameHeight + FRAME_GAP + 32);
    const frameId = `moldura-${frameIndex}`;
    if (slot === 0) {
      frames.push({
        id: frameId,
        title: `Seção ${frameIndex + 1}`,
        position: { x: frameX, y: frameY },
        size: { width: frameWidth, height: frameHeight },
      });
    }
    const base = {
      id: `bloco-${index}`,
      frameId,
      position: {
        x: frameX + PADDING + (slot % COLUMNS) * (BLOCK.width + GAP),
        y: frameY + PADDING + Math.floor(slot / COLUMNS) * (BLOCK.height + GAP),
      },
      size: { ...BLOCK },
    };
    const label = `Bloco ${index + 1}`;
    switch (TYPES[index % TYPES.length]) {
      case 'card':
        content.push({
          ...base,
          type: 'card',
          tag: 'Etapa',
          title: label,
          description: 'Descrição curta do cartão',
        });
        break;
      case 'sticky':
        content.push({ ...base, type: 'sticky', text: label, color: 'yellow' });
        break;
      case 'text':
        content.push({
          ...base,
          type: 'text',
          text: `${label}\n- primeiro ponto\n- segundo ponto`,
        });
        break;
      case 'shape':
        content.push({ ...base, type: 'shape', shape: 'rectangle', text: label });
        break;
      case 'checklist':
        content.push({
          ...base,
          type: 'checklist',
          title: label,
          items: [
            { id: `item-${index}-a`, text: 'Primeira etapa', done: true },
            { id: `item-${index}-b`, text: 'Segunda etapa', done: false },
          ],
        });
        break;
      case 'link':
        content.push({
          ...base,
          type: 'link',
          url: 'https://example.com/aula',
          title: label,
        });
        break;
    }
    // Uma seta do bloco para o seguinte da mesma moldura, em blocos alternados.
    if (slot % 2 === 0 && slot + 1 < PER_FRAME && index + 1 < blocks) {
      arrows.push({
        id: `seta-${index}`,
        from: { nodeId: `bloco-${index}` },
        to: { nodeId: `bloco-${index + 1}` },
      });
    }
  }

  return flowContentSchema.parse({
    schemaVersion: 1,
    frames,
    blocks: content,
    arrows,
  });
}

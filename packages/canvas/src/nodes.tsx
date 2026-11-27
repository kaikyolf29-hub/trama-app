import type { Block } from '@trama/core';
import { cn } from '@trama/ui';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { BlockNode as BlockNodeType, FrameNode as FrameNodeType } from './convert';

const SIDES = [
  ['top', Position.Top],
  ['right', Position.Right],
  ['bottom', Position.Bottom],
  ['left', Position.Left],
] as const;

/**
 * Pontos de conexão no meio de cada borda (o "ponto azul" da tela 1). Cada um serve de
 * saída e de chegada: o quadro usa o modo de conexão solto.
 */
function SideHandles({ visible }: { visible: boolean }) {
  return (
    <>
      {SIDES.map(([id, position]) => (
        <Handle
          key={id}
          id={id}
          type="source"
          position={position}
          className={cn(
            'size-2.5! rounded-full! border-2! border-canvas! bg-selection! transition-opacity',
            visible ? 'opacity-100' : 'opacity-0',
          )}
        />
      ))}
    </>
  );
}

/** Texto principal de cada tipo de bloco, para a versão simples da etapa 1.1. */
function blockSummary(block: Block): { label: string; text: string } {
  switch (block.type) {
    case 'text':
      return { label: 'Texto', text: block.text };
    case 'card':
      return { label: block.tag ?? 'Cartão', text: block.title };
    case 'sticky':
      return { label: 'Nota', text: block.text };
    case 'shape':
      return { label: 'Forma', text: block.text };
    case 'image':
      return { label: 'Imagem', text: block.fileName ?? block.caption ?? '' };
    case 'link':
      return { label: 'Vídeo ou link', text: block.title ?? block.url };
    case 'checklist':
      return {
        label: block.title,
        text: `${block.items.filter((item) => item.done).length}/${block.items.length}`,
      };
    case 'audio':
      return { label: 'Áudio', text: block.transcript ?? '' };
  }
}

/** Bloco na versão base: superfície do Trama com o rótulo e o texto principal. */
export function BlockNode({ data, selected }: NodeProps<BlockNodeType>) {
  const { label, text } = blockSummary(data.block);
  return (
    <div
      className={cn(
        'relative flex size-full flex-col gap-1.5 overflow-hidden rounded-block border border-border bg-surface p-4 shadow-block',
        selected && 'outline-2 outline-offset-2 outline-selection',
      )}
    >
      <span className="text-[11px] font-semibold tracking-wider text-text-muted uppercase">
        {label}
      </span>
      <span className="line-clamp-4 text-sm whitespace-pre-line text-text-strong">{text}</span>
      <SideHandles visible={selected} />
    </div>
  );
}

/** Moldura: agrupa blocos e dá nome à seção. O nome fica acima da borda, como na tela 1. */
export function FrameNode({ data, selected }: NodeProps<FrameNodeType>) {
  return (
    <div
      className={cn(
        'relative size-full rounded-frame border border-frame-border bg-frame',
        selected && 'outline-2 outline-offset-2 outline-selection',
      )}
    >
      {data.frame.title && (
        <span className="absolute -top-7 left-0 text-[13px] font-medium whitespace-nowrap text-text-muted">
          {data.frame.title}
        </span>
      )}
      <SideHandles visible={selected} />
    </div>
  );
}

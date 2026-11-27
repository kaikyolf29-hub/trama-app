import { cn } from '@trama/ui';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { BlockView } from './block-views';
import { ContextBar } from './context-bar';
import { useCanvas } from './canvas-context';
import type { BlockNode as BlockNodeType, FrameNode as FrameNodeType } from './convert';
import { EditableText } from './EditableText';

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

/** Um bloco no quadro. Clique duplo edita o texto. */
export function BlockNode({ id, data, selected, dragging }: NodeProps<BlockNodeType>) {
  const { editingId, startEditing } = useCanvas();
  const editing = editingId === id;
  const { block } = data;
  return (
    <div
      onDoubleClick={() => {
        // Bloco travado não muda até destravar (clique direito).
        if (!block.locked) startEditing(id);
      }}
      className={cn(
        'relative size-full',
        selected && 'rounded-block outline-2 outline-offset-4 outline-selection',
      )}
    >
      <BlockView block={block} editing={editing} />
      <SideHandles visible={selected && !editing} />
      <ContextBar id={id} block={block} hidden={editing || block.locked || dragging} />
    </div>
  );
}

/** Moldura: agrupa blocos e dá nome à seção. O nome fica acima da borda e edita no clique duplo. */
export function FrameNode({ id, data, selected, dragging }: NodeProps<FrameNodeType>) {
  const { editingId, startEditing, stopEditing, updateFrame } = useCanvas();
  const editing = editingId === id;
  const { frame } = data;
  return (
    <div
      className={cn(
        'relative size-full rounded-frame border border-frame-border bg-frame',
        selected && 'outline-2 outline-offset-2 outline-selection',
      )}
    >
      <div
        className="absolute -top-8 left-0 w-full min-w-48"
        onDoubleClick={(event) => {
          event.stopPropagation();
          startEditing(id);
        }}
      >
        <EditableText
          singleLine
          selectAll
          value={frame.title}
          editing={editing}
          label="Nome da moldura"
          placeholder="Nome da seção"
          onCommit={(title) => {
            updateFrame({ ...frame, title });
            stopEditing();
          }}
          className="text-[13px] font-medium text-text-strong"
        >
          <span className="block truncate pt-1 text-[13px] font-medium text-text-muted">
            {frame.title || 'Sem nome'}
          </span>
        </EditableText>
      </div>
      <SideHandles visible={selected} />
      <ContextBar id={id} hidden={editing || frame.locked || dragging} />
    </div>
  );
}

import type { Block, Frame } from '@trama/core';
import { cn } from '@trama/ui';
import type { Node, NodeProps } from '@xyflow/react';
import { BlockView } from './block-views';
import { SideHandles } from './nodes';
import { stepTag, type NodeState } from './present';

/** Dados de um nó na apresentação: o bloco ou a moldura, e como ele aparece agora. */
export type PresentNodeData = {
  block?: Block;
  frame?: Frame;
  state: NodeState;
  /** Este nó leva a etiqueta "Passo N" do passo dele (um por passo, veja `stepTagHolders`). */
  tag?: boolean;
};
export type PresentNode = Node<PresentNodeData, 'pblock' | 'pframe'>;

/** Altura (px) a partir da qual o quadro tracejado ganha o texto "Passo N · ainda oculto". */
const PLACEHOLDER_LABEL_MIN = 64;

/** O quadro tracejado no lugar de um passo que ainda não chegou (tela 2). */
function Placeholder({ step, height, frame }: { step: number; height: number; frame?: boolean }) {
  return (
    <div
      className={cn(
        'flex size-full items-center justify-center border border-dashed border-border text-sm text-text-muted',
        frame ? 'rounded-frame' : 'rounded-block',
      )}
    >
      {/* Num bloco baixo (um título) o texto não cabe: fica só o tracejado. */}
      {height >= PLACEHOLDER_LABEL_MIN && `Passo ${step} · ainda oculto`}
    </div>
  );
}

/** Discreto (passo que passou), em destaque (passo de agora) ou normal (fora dos passos). */
function stateClass(state: NodeState, frame: boolean): string {
  const rounded = frame ? 'rounded-frame' : 'rounded-block';
  switch (state.kind) {
    case 'past':
      return 'opacity-45';
    case 'current':
      // Quem só acompanha a moldura não ganha contorno: a moldura já está em destaque.
      return state.own ? cn(rounded, 'outline-2 outline-text-strong') : '';
    default:
      return '';
  }
}

const TAG_CLASS = 'text-[11px] font-semibold tracking-wider whitespace-nowrap uppercase';

/** "Passo N · agora" acima do bloco que tem passo próprio (tela 2). */
function StepTag({ state, show }: { state: NodeState; show: boolean }) {
  const tag = show ? stepTag(state) : null;
  if (!tag) return null;
  return (
    <span
      className={cn(
        'pointer-events-none absolute -top-6 left-0',
        TAG_CLASS,
        state.kind === 'current' ? 'text-text-strong' : 'text-text-muted',
      )}
    >
      {tag}
    </span>
  );
}

/** Um bloco na apresentação: só leitura, sem alças nem barra de contexto. */
export function PresentBlockNode({ data }: NodeProps<PresentNode>) {
  const { block, state } = data;
  if (!block) return null;
  if (state.kind === 'future') return <Placeholder step={state.step} height={block.size.height} />;
  return (
    <div
      data-state={state.kind}
      className={cn('relative size-full transition-opacity duration-150', stateClass(state, false))}
    >
      <StepTag state={state} show={data.tag === true} />
      <BlockView block={block} editing={false} />
      <SideHandles visible={false} inert />
    </div>
  );
}

/** Uma moldura na apresentação, com o nome acima da borda como no editor. */
export function PresentFrameNode({ data }: NodeProps<PresentNode>) {
  const { frame, state } = data;
  if (!frame) return null;
  if (state.kind === 'future')
    return <Placeholder step={state.step} height={frame.size.height} frame />;
  const tag = data.tag ? stepTag(state) : null;
  return (
    <div
      data-state={state.kind}
      className={cn(
        'relative size-full rounded-frame border border-frame-border bg-frame transition-opacity duration-150',
        stateClass(state, true),
      )}
    >
      <span className="absolute -top-8 left-0 flex w-full min-w-48 items-baseline gap-2 pt-1 text-[13px] font-medium text-text-muted">
        <span className="truncate">{frame.title || 'Sem nome'}</span>
        {/* Na moldura, a etiqueta do passo vem depois do nome. */}
        {tag && (
          <span
            className={cn(
              'shrink-0',
              TAG_CLASS,
              state.kind === 'current' ? 'text-text-strong' : 'text-text-muted',
            )}
          >
            {tag}
          </span>
        )}
      </span>
      <SideHandles visible={false} inert />
    </div>
  );
}

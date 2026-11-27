import {
  setBadgeDone,
  type Block,
  type CardBlock,
  type ShapeBlock,
  type StickyBlock,
  type TextBlock,
} from '@trama/core';
import { cn } from '@trama/ui';
import { CheckIcon } from '@trama/ui/icons';
import { colors, fonts, noteColors, textColors } from '@trama/ui/tokens';
import type { CSSProperties } from 'react';
import { useCanvas } from './canvas-context';
import { EditableText } from './EditableText';
import { formatDay } from './format';
import { AudioBlockView, ChecklistBlockView, ImageBlockView, LinkBlockView } from './media-views';
import { parseTextLines } from './text-lines';

type ViewProps<T extends Block> = { block: T; editing: boolean };

/** Salva o bloco editado e sai da edição. */
function useCommit() {
  const { updateBlock, stopEditing } = useCanvas();
  return (next: Block) => {
    updateBlock(next);
    stopEditing();
  };
}

/** O texto do bloco com as listas da convenção do core ("- " e "1. "). */
function FormattedText({ text, style }: { text: string; style?: CSSProperties }) {
  return (
    <div className="flex flex-col gap-1" style={style}>
      {parseTextLines(text).map((part, index) => {
        if (part.kind === 'paragraph') return <p key={index}>{part.text}</p>;
        const List = part.kind === 'bullets' ? 'ul' : 'ol';
        return (
          <List
            key={index}
            className={cn(
              'flex flex-col gap-1 pl-5',
              part.kind === 'bullets' ? 'list-disc' : 'list-decimal',
            )}
          >
            {part.items.map((item, itemIndex) => (
              <li key={itemIndex}>{item}</li>
            ))}
          </List>
        );
      })}
    </div>
  );
}

/** Texto (tecla T): direto no quadro, sem caixa. Fonte, tamanho e cor valem para o bloco todo. */
export function TextBlockView({ block, editing }: ViewProps<TextBlock>) {
  const commit = useCommit();
  const style: CSSProperties = {
    fontFamily: fonts[block.font],
    fontSize: block.fontSize,
    color: textColors[block.color],
    fontWeight: block.bold ? 600 : 400,
    fontStyle: block.italic ? 'italic' : 'normal',
    lineHeight: 1.45,
  };
  return (
    <div className="size-full overflow-hidden">
      <EditableText
        value={block.text}
        editing={editing}
        label="Texto"
        placeholder="Escreva aqui"
        onCommit={(text) => commit({ ...block, text })}
        style={style}
      >
        {block.text ? (
          <FormattedText text={block.text} style={style} />
        ) : (
          <p style={{ ...style, color: colors.textMuted }}>Escreva aqui</p>
        )}
      </EditableText>
    </div>
  );
}

function formatDoneAt(doneAt: string): string {
  return new Date(doneAt).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Cartão (tecla C): etiqueta, título, descrição e o selo de status, como o "Projeto" da tela 1. */
export function CardBlockView({ block, editing }: ViewProps<CardBlock>) {
  const { updateBlock } = useCanvas();
  const commit = useCommit();
  const status = block.status;
  return (
    <div className="flex size-full flex-col gap-1.5 overflow-hidden rounded-block border border-border bg-surface p-4 shadow-block">
      {(block.tag || status?.doneAt) && (
        <div className="flex items-center justify-between gap-2 text-[11px] font-semibold tracking-[0.05em] text-text-muted uppercase">
          <span className="truncate">{block.tag}</span>
          {status?.done && status.doneAt && (
            <time dateTime={status.doneAt} className="shrink-0">
              {formatDay(status.doneAt)}
            </time>
          )}
        </div>
      )}
      <EditableText
        singleLine
        value={block.title}
        editing={editing}
        label="Título do cartão"
        placeholder="Sem título"
        onCommit={(title) => commit({ ...block, title })}
        className="text-lg leading-snug font-semibold text-text-strong"
      >
        <span
          className={cn(
            'text-lg leading-snug font-semibold tracking-tight',
            block.title ? 'text-text-strong' : 'text-text-muted',
          )}
        >
          {block.title || 'Sem título'}
        </span>
      </EditableText>
      {block.description && (
        <span className="line-clamp-2 text-[13px] text-text-muted">{block.description}</span>
      )}
      {status && (
        <button
          type="button"
          role="checkbox"
          aria-checked={status.done}
          title={
            status.done && status.doneAt ? `Marcado em ${formatDoneAt(status.doneAt)}` : 'Marcar'
          }
          onClick={() => updateBlock({ ...block, status: setBadgeDone(status, !status.done) })}
          className="nodrag mt-auto flex items-center gap-2 self-start rounded-tag focus-visible:outline-2 focus-visible:outline-selection"
        >
          <span
            className={cn(
              'flex size-[18px] items-center justify-center rounded-[5px] transition-colors',
              status.done ? 'bg-done' : 'border border-text-muted',
            )}
          >
            {status.done && (
              <CheckIcon size={12} strokeWidth={3} className="text-brand-ink" aria-hidden />
            )}
          </span>
          <span
            className={cn(
              'rounded-tag px-2 py-0.5 text-xs font-semibold transition-colors',
              status.done ? 'bg-done-surface text-done-text' : 'bg-hover text-text-muted',
            )}
          >
            {status.label}
          </span>
        </button>
      )}
    </div>
  );
}

/** Nota adesiva (tecla N), nas quatro cores do Notion escuro. */
export function StickyBlockView({ block, editing }: ViewProps<StickyBlock>) {
  const commit = useCommit();
  const color = noteColors[block.color];
  return (
    <div
      className="size-full overflow-hidden rounded-sticky p-3.5 shadow-block"
      style={{ backgroundColor: color.bg, color: color.fg }}
    >
      <EditableText
        value={block.text}
        editing={editing}
        label="Texto da nota"
        placeholder="Escreva uma ideia"
        onCommit={(text) => commit({ ...block, text })}
        className="text-[13px] leading-relaxed"
        style={{ color: color.fg }}
      >
        <p className="text-[13px] leading-relaxed whitespace-pre-line">
          {block.text || <span className="opacity-60">Escreva uma ideia</span>}
        </p>
      </EditableText>
    </div>
  );
}

const SHAPE_CLASS: Record<ShapeBlock['shape'], string> = {
  rectangle: 'rounded-control',
  ellipse: 'rounded-[50%]',
  diamond: '',
};

/** Forma (tecla R): retângulo, círculo ou losango, com o texto no meio. */
export function ShapeBlockView({ block, editing }: ViewProps<ShapeBlock>) {
  const commit = useCommit();
  return (
    <div className="relative flex size-full items-center justify-center p-4 text-center">
      {block.shape === 'diamond' ? (
        <svg
          className="absolute inset-0 size-full overflow-visible"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          <polygon
            points="50,0 100,50 50,100 0,50"
            fill={colors.surface}
            stroke={colors.border}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : (
        <div
          className={cn(
            'absolute inset-0 border border-border bg-surface shadow-block',
            SHAPE_CLASS[block.shape],
          )}
        />
      )}
      <div className="relative w-full text-sm text-text-strong">
        <EditableText
          value={block.text}
          editing={editing}
          label="Texto da forma"
          onCommit={(text) => commit({ ...block, text })}
          className="text-center text-sm text-text-strong"
        >
          <p className="whitespace-pre-line">{block.text}</p>
        </EditableText>
      </div>
    </div>
  );
}

/** Escolhe a visão de cada tipo de bloco. */
export function BlockView({ block, editing }: ViewProps<Block>) {
  switch (block.type) {
    case 'text':
      return <TextBlockView block={block} editing={editing} />;
    case 'card':
      return <CardBlockView block={block} editing={editing} />;
    case 'sticky':
      return <StickyBlockView block={block} editing={editing} />;
    case 'shape':
      return <ShapeBlockView block={block} editing={editing} />;
    case 'image':
      return <ImageBlockView block={block} editing={editing} />;
    case 'link':
      return <LinkBlockView block={block} editing={editing} />;
    case 'checklist':
      return <ChecklistBlockView block={block} editing={editing} />;
    case 'audio':
      return <AudioBlockView block={block} />;
  }
}

import {
  noteColorSchema,
  shapeKindSchema,
  textColorSchema,
  textFontSchema,
  type Block,
  type NoteColor,
  type TextColor,
  type TextFont,
} from '@trama/core';
import { cn } from '@trama/ui';
import { BoldIcon, ItalicIcon, TrashIcon } from '@trama/ui/icons';
import { fonts, noteColors, textColors } from '@trama/ui/tokens';
import { NodeToolbar, Position } from '@xyflow/react';
import { useState, type ReactNode } from 'react';
import { useCanvas } from './canvas-context';

const FONT_NAMES: Record<TextFont, string> = {
  sans: 'Padrão',
  serif: 'Serifa',
  mono: 'Mono',
  hand: 'Manuscrita',
};
const FONT_SIZES = [12, 14, 16, 20, 24, 32, 40, 48, 64, 96];
const TEXT_COLOR_NAMES: Record<TextColor, string> = {
  strong: 'Branco',
  normal: 'Cinza claro',
  muted: 'Cinza',
  yellow: 'Amarelo',
  blue: 'Azul',
  green: 'Verde',
  pink: 'Rosa',
};
const SHAPE_NAMES = { rectangle: 'Retângulo', ellipse: 'Círculo', diamond: 'Losango' } as const;

const control =
  'h-7 rounded-tag px-2 text-xs text-text transition-colors hover:bg-hover hover:text-text-strong focus-visible:outline-2 focus-visible:outline-selection';
const select = cn(control, 'cursor-pointer appearance-none bg-transparent pr-1');

function Divider() {
  return <span className="mx-0.5 my-1.5 w-px self-stretch bg-border" aria-hidden />;
}

function Toggle({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        control,
        'flex w-7 items-center justify-center px-0',
        pressed && 'bg-border text-text-strong',
      )}
    >
      {children}
    </button>
  );
}

/** Bolinhas de cor; abre ao clicar na cor atual (o círculo da tela 1). */
function ColorPicker<C extends string>({
  label,
  value,
  options,
  swatch,
  names,
  onChange,
}: {
  label: string;
  value: C;
  options: readonly C[];
  swatch: (color: C) => string;
  names: Record<C, string>;
  onChange: (color: C) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex items-center">
      <button
        type="button"
        aria-label={`${label}: ${names[value]}`}
        title={label}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn(control, 'flex w-7 items-center justify-center px-0')}
      >
        <span
          className="size-4 rounded-full border border-border"
          style={{ backgroundColor: swatch(value) }}
        />
      </button>
      {open && (
        <div
          role="radiogroup"
          aria-label={label}
          className="absolute top-9 left-1/2 flex -translate-x-1/2 gap-1 rounded-control border border-border bg-floating p-1.5 shadow-floating"
        >
          {options.map((color) => (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={color === value}
              aria-label={names[color]}
              title={names[color]}
              onClick={() => {
                onChange(color);
                setOpen(false);
              }}
              className={cn(
                'size-6 rounded-full border-2 focus-visible:outline-2 focus-visible:outline-selection',
                color === value ? 'border-selection' : 'border-transparent',
              )}
              style={{ backgroundColor: swatch(color) }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** As opções que dependem do tipo de bloco. */
function BlockOptions({ block }: { block: Block }) {
  const { updateBlock } = useCanvas();
  switch (block.type) {
    case 'text':
      return (
        <>
          <select
            aria-label="Fonte"
            value={block.font}
            onChange={(event) =>
              updateBlock({ ...block, font: textFontSchema.parse(event.target.value) })
            }
            className={select}
            style={{ fontFamily: fonts[block.font] }}
          >
            {textFontSchema.options.map((font) => (
              <option key={font} value={font}>
                {FONT_NAMES[font]}
              </option>
            ))}
          </select>
          <select
            aria-label="Tamanho"
            value={block.fontSize}
            onChange={(event) => updateBlock({ ...block, fontSize: Number(event.target.value) })}
            className={cn(select, 'tabular-nums')}
          >
            {[...new Set([...FONT_SIZES, block.fontSize])]
              .sort((a, b) => a - b)
              .map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
          </select>
          <Toggle
            label="Negrito"
            pressed={block.bold}
            onClick={() => updateBlock({ ...block, bold: !block.bold })}
          >
            <BoldIcon size={14} strokeWidth={2.25} aria-hidden />
          </Toggle>
          <Toggle
            label="Itálico"
            pressed={block.italic}
            onClick={() => updateBlock({ ...block, italic: !block.italic })}
          >
            <ItalicIcon size={14} aria-hidden />
          </Toggle>
          <ColorPicker
            label="Cor do texto"
            value={block.color}
            options={textColorSchema.options}
            swatch={(color) => textColors[color]}
            names={TEXT_COLOR_NAMES}
            onChange={(color) => updateBlock({ ...block, color })}
          />
          <Divider />
        </>
      );
    case 'sticky':
      return (
        <>
          <ColorPicker<NoteColor>
            label="Cor da nota"
            value={block.color}
            options={noteColorSchema.options}
            swatch={(color) => noteColors[color].bg}
            names={TEXT_COLOR_NAMES}
            onChange={(color) => updateBlock({ ...block, color })}
          />
          <Divider />
        </>
      );
    case 'shape':
      return (
        <>
          <select
            aria-label="Forma"
            value={block.shape}
            onChange={(event) =>
              updateBlock({ ...block, shape: shapeKindSchema.parse(event.target.value) })
            }
            className={select}
          >
            {shapeKindSchema.options.map((shape) => (
              <option key={shape} value={shape}>
                {SHAPE_NAMES[shape]}
              </option>
            ))}
          </select>
          <Divider />
        </>
      );
    default:
      return null;
  }
}

/** "Aula: passo N" da tela 1: escolhe em que passo do modo aula o nó aparece. */
function StepSelect({ id }: { id: string }) {
  const { stepOf, stepCount, setStep } = useCanvas();
  const current = stepOf(id);
  return (
    <select
      aria-label="Passo da aula"
      value={current ?? ''}
      onChange={(event) => {
        const value = event.target.value;
        setStep(id, value === '' ? null : value === 'new' ? 'new' : Number(value));
      }}
      className={select}
    >
      <option value="">Fora da aula</option>
      {Array.from({ length: stepCount }, (_, index) => (
        <option key={index + 1} value={index + 1}>
          Aula: passo {index + 1}
        </option>
      ))}
      <option value="new">Aula: passo novo</option>
    </select>
  );
}

/**
 * Barra de contexto em cima do bloco ou da moldura selecionada (tela 1): fonte, tamanho e cor
 * do texto, cor da nota, tipo da forma, passo da aula e apagar. Só aparece com um nó
 * selecionado e fora da edição.
 */
export function ContextBar({ id, block, hidden }: { id: string; block?: Block; hidden: boolean }) {
  const { removeNode } = useCanvas();
  return (
    // Sem `isVisible`, o React Flow só mostra com este nó sozinho na seleção.
    <NodeToolbar
      nodeId={id}
      isVisible={hidden ? false : undefined}
      position={Position.Top}
      offset={12}
    >
      <div
        role="toolbar"
        aria-label="Opções do bloco"
        className="nodrag nopan flex items-center gap-0.5 rounded-control border border-border bg-floating p-1 shadow-floating"
      >
        {block && <BlockOptions block={block} />}
        <StepSelect id={id} />
        <Divider />
        <button
          type="button"
          aria-label="Apagar"
          title="Apagar (Delete)"
          onClick={() => removeNode(id)}
          className={cn(
            control,
            'flex w-7 items-center justify-center px-0 hover:text-text-strong',
          )}
        >
          <TrashIcon size={14} aria-hidden />
        </button>
      </div>
    </NodeToolbar>
  );
}

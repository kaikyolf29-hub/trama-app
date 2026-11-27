import type { FlowContent, PresentationStep } from '@trama/core';
import { cn } from '@trama/ui';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CloseIcon,
  GripIcon,
  PencilIcon,
  TrashIcon,
} from '@trama/ui/icons';
import { useRef, useState } from 'react';
import { stepName } from './present';
import { addStep, MAX_STEP_TITLE, moveStep, removeStep, renameStep } from './steps';

export interface OrderPanelProps {
  /** O fluxo de agora (os nomes dos passos vêm dos blocos). */
  flow: FlowContent;
  /** Blocos e molduras selecionados no quadro. */
  selectedIds: readonly string[];
  /** Os passos novos. Quem usa o painel grava pelo mesmo caminho de toda mudança do quadro. */
  onChange: (presentation: PresentationStep[]) => void;
  /** Clicar no nome de um passo mostra os blocos dele no quadro. */
  onShow: (step: PresentationStep) => void;
  onClose: () => void;
}

const iconButton =
  'flex size-7 shrink-0 items-center justify-center rounded-tag text-text-muted transition-colors hover:bg-hover hover:text-text-strong focus-visible:outline-2 focus-visible:outline-selection disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-muted';

/**
 * "Ordem da apresentação": os passos do modo aula em lista. Dá para reordenar (arrastar ou
 * subir e descer), renomear, apagar e criar um passo com a seleção do quadro.
 */
export function OrderPanel({ flow, selectedIds, onChange, onShow, onClose }: OrderPanelProps) {
  const steps = flow.presentation;
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  return (
    <section
      aria-label="Ordem da apresentação"
      className="flex max-h-full w-88 flex-col rounded-block border border-border bg-floating shadow-floating"
    >
      <header className="flex items-center justify-between gap-2 py-3 pr-2 pl-4">
        <h2 className="text-sm font-semibold text-text-strong">Ordem da apresentação</h2>
        <button type="button" aria-label="Fechar" onClick={onClose} className={iconButton}>
          <CloseIcon size={16} aria-hidden />
        </button>
      </header>

      {steps.length === 0 ? (
        <p className="px-4 pb-3 text-[13px] text-text-muted">
          Nenhum passo ainda. Escolha blocos no quadro e use o botão abaixo: cada passo aparece de
          uma vez só na apresentação.
        </p>
      ) : (
        <ol className="flex min-h-0 flex-col gap-0.5 overflow-y-auto px-2 pb-2">
          {steps.map((step, index) => (
            <li
              key={step.id}
              draggable={renaming !== step.id}
              onDragStart={(event) => {
                setDragFrom(index);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', step.id);
              }}
              onDragOver={(event) => {
                if (dragFrom === null) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setDragOver(index);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragFrom !== null) onChange(moveStep(steps, dragFrom, index));
                setDragFrom(null);
                setDragOver(null);
              }}
              onDragEnd={() => {
                setDragFrom(null);
                setDragOver(null);
              }}
              className={cn(
                'flex items-center gap-1 rounded-control py-1 pr-1 pl-0.5 transition-colors hover:bg-hover',
                dragFrom === index && 'opacity-50',
                dragOver === index && dragFrom !== index && 'outline-2 outline-selection',
              )}
            >
              <span
                className="flex size-5 shrink-0 cursor-grab items-center text-text-muted"
                aria-hidden
              >
                <GripIcon size={16} />
              </span>
              <span className="flex size-6 shrink-0 items-center justify-center rounded-tag border border-border text-xs text-text-strong tabular-nums">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1 px-1.5">
                {renaming === step.id ? (
                  <RenameField
                    step={step}
                    index={index}
                    placeholder={stepName(flow, { ...step, title: undefined })}
                    onDone={(title) => {
                      if (title !== null) onChange(renameStep(steps, step.id, title));
                      setRenaming(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    title="Mostrar no quadro"
                    onClick={() => onShow(step)}
                    onDoubleClick={() => setRenaming(step.id)}
                    className="block w-full text-left focus-visible:outline-2 focus-visible:outline-selection"
                  >
                    <span className="block truncate text-[13px] text-text-strong">
                      {stepName(flow, step)}
                    </span>
                    <span className="block text-xs text-text-muted">
                      {step.targetIds.length === 1 ? '1 item' : `${step.targetIds.length} itens`}
                    </span>
                  </button>
                )}
              </div>
              <button
                type="button"
                aria-label={`Subir o passo ${index + 1}`}
                title="Subir"
                disabled={index === 0}
                onClick={() => onChange(moveStep(steps, index, index - 1))}
                className={iconButton}
              >
                <ChevronUpIcon size={16} aria-hidden />
              </button>
              <button
                type="button"
                aria-label={`Descer o passo ${index + 1}`}
                title="Descer"
                disabled={index === steps.length - 1}
                onClick={() => onChange(moveStep(steps, index, index + 1))}
                className={iconButton}
              >
                <ChevronDownIcon size={16} aria-hidden />
              </button>
              <button
                type="button"
                aria-label={`Renomear o passo ${index + 1}`}
                title="Renomear"
                onClick={() => setRenaming(step.id)}
                className={iconButton}
              >
                <PencilIcon size={14} aria-hidden />
              </button>
              <button
                type="button"
                aria-label={`Apagar o passo ${index + 1}`}
                title="Apagar o passo (os blocos ficam no quadro)"
                onClick={() => onChange(removeStep(steps, step.id))}
                className={iconButton}
              >
                <TrashIcon size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ol>
      )}

      <footer className="flex flex-col gap-2 border-t border-border p-3">
        <button
          type="button"
          disabled={selectedIds.length === 0}
          onClick={() => onChange(addStep(steps, selectedIds))}
          className="h-9 rounded-control bg-text-strong px-3.5 text-[13px] font-semibold text-brand-ink transition-colors hover:bg-brand-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-selection disabled:cursor-not-allowed disabled:bg-border disabled:text-text-muted"
        >
          Adicionar a seleção como passo
        </button>
        <p className="text-xs text-text-muted">
          {selectedIds.length === 0
            ? 'Selecione blocos ou molduras no quadro.'
            : selectedIds.length === 1
              ? '1 item selecionado.'
              : `${selectedIds.length} itens selecionados.`}{' '}
          Cada um fica em um passo só.
        </p>
      </footer>
    </section>
  );
}

/** Campo do nome do passo: Enter ou sair do campo confirma, Esc cancela. */
function RenameField({
  step,
  index,
  placeholder,
  onDone,
}: {
  step: PresentationStep;
  index: number;
  placeholder: string;
  /** `null` cancela. */
  onDone: (title: string | null) => void;
}) {
  const [value, setValue] = useState(step.title ?? '');
  // Esc cancela; sem isto, o campo que some ainda dispararia o "sair do campo" e confirmaria.
  const cancelled = useRef(false);
  return (
    <input
      autoFocus
      aria-label={`Nome do passo ${index + 1}`}
      value={value}
      maxLength={MAX_STEP_TITLE}
      placeholder={placeholder}
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={() => onDone(cancelled.current ? null : value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          cancelled.current = true;
          event.currentTarget.blur();
        }
      }}
      className="h-8 w-full rounded-tag border border-border bg-field px-2 text-[13px] text-text-strong outline-none placeholder:text-text-muted focus:border-selection"
    />
  );
}

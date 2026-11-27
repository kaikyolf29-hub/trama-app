import { cn } from '@trama/ui';
import { useState, type CSSProperties, type KeyboardEvent } from 'react';

interface EditableTextProps {
  value: string;
  editing: boolean;
  onCommit: (value: string) => void;
  /** Nome do campo para leitores de tela, ex.: "Texto da nota". */
  label: string;
  placeholder?: string;
  /** Uma linha só: Enter confirma. Em várias linhas, Enter quebra a linha. */
  singleLine?: boolean;
  /** Seleciona o texto todo ao abrir (renomear), em vez de pôr o cursor no fim. */
  selectAll?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Como o texto aparece fora da edição. */
  children: React.ReactNode;
}

/**
 * Texto que vira campo de edição no clique duplo. Sair do campo, Esc ou (em uma linha)
 * Enter confirmam. As classes `nodrag nowheel` deixam selecionar o texto sem arrastar o
 * bloco nem dar zoom.
 */
export function EditableText({
  value,
  editing,
  onCommit,
  label,
  placeholder,
  singleLine = false,
  selectAll = false,
  className,
  style,
  children,
}: EditableTextProps) {
  const [draft, setDraft] = useState(value);
  const [wasEditing, setWasEditing] = useState(editing);
  // Ao entrar na edição, começa do valor atual (padrão do React para estado derivado).
  if (editing !== wasEditing) {
    setWasEditing(editing);
    if (editing) setDraft(value);
  }

  if (!editing) return <>{children}</>;

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape' || (singleLine && event.key === 'Enter' && !event.shiftKey)) {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  return (
    <textarea
      aria-label={label}
      autoFocus
      value={draft}
      placeholder={placeholder}
      rows={singleLine ? 1 : undefined}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => onCommit(singleLine ? draft.replace(/\n/g, ' ') : draft)}
      onKeyDown={onKeyDown}
      onFocus={(event) => {
        if (selectAll) {
          event.currentTarget.select();
          return;
        }
        const end = event.currentTarget.value.length;
        event.currentTarget.setSelectionRange(end, end);
      }}
      className={cn(
        'nodrag nowheel w-full resize-none bg-transparent outline-none placeholder:text-text-muted',
        singleLine ? 'overflow-hidden' : 'h-full',
        className,
      )}
      style={style}
    />
  );
}

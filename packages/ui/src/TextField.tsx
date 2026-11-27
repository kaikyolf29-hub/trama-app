import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  /** Explicação curta abaixo do campo. */
  hint?: ReactNode;
  /** Mensagem de erro; marca o campo como inválido. */
  error?: string | null;
  /** Ação à direita do rótulo (ex.: "Esqueci a senha"). */
  labelAction?: ReactNode;
  /** Conteúdo dentro do campo, à direita (ex.: mostrar a senha). */
  trailing?: ReactNode;
  id?: string;
}

export function TextField({
  label,
  hint,
  error,
  labelAction,
  trailing,
  id,
  className,
  ...rest
}: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  // Com erro, a mensagem de erro toma o lugar da dica (elas costumam dizer o mesmo).
  const showHint = Boolean(hint) && !error;
  const hintId = showHint ? `${inputId}-dica` : undefined;
  const errorId = error ? `${inputId}-erro` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={inputId} className="text-[13px] font-medium text-text">
          {label}
        </label>
        {labelAction}
      </div>
      <div
        className={cn(
          'flex h-11 items-center rounded-control border bg-field transition-colors',
          'focus-within:border-selection focus-within:outline-1 focus-within:outline-selection',
          error ? 'border-note-pink-fg' : 'border-border',
        )}
      >
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm text-text-strong outline-none placeholder:text-text-muted"
          {...rest}
        />
        {trailing}
      </div>
      {error && (
        <p id={errorId} className="text-[13px] text-note-pink-fg">
          {error}
        </p>
      )}
      {showHint && (
        <p id={hintId} className="text-xs text-text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

export type PasswordFieldProps = Omit<TextFieldProps, 'type' | 'trailing'>;

/** Campo de senha com o botão de mostrar e ocultar. */
export function PasswordField(props: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      {...props}
      type={visible ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
          className="mr-1 h-8 rounded-tag px-2.5 text-xs font-medium text-text-muted transition-colors hover:bg-hover hover:text-text-strong focus-visible:outline-2 focus-visible:outline-selection"
        >
          {visible ? 'Ocultar' : 'Mostrar'}
        </button>
      }
    />
  );
}

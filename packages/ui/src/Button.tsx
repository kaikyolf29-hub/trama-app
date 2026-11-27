import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Mostra o indicador de carregamento e bloqueia novos cliques. */
  loading?: boolean;
  /** Ocupa a largura toda (formulários). */
  block?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  // Claro sobre o escuro, como o "Apresentar" da tela 1.
  primary: 'bg-text-strong text-brand-ink hover:bg-brand-paper disabled:bg-text-muted',
  secondary:
    'bg-transparent text-text border border-border hover:bg-hover hover:text-text-strong disabled:text-text-muted',
  ghost: 'bg-transparent text-text hover:bg-hover hover:text-text-strong disabled:text-text-muted',
};

const SIZES: Record<Size, string> = {
  md: 'h-9 px-3.5 text-[13px]',
  lg: 'h-11 px-4 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  block = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-control font-semibold transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-selection',
        'disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

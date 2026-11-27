import type { ReactNode } from 'react';
import { cn } from './cn';

type Tone = 'error' | 'success' | 'info';

const TONES: Record<Tone, string> = {
  error: 'bg-note-pink-bg text-note-pink-fg',
  success: 'bg-done-surface text-done-text',
  info: 'bg-note-blue-bg text-note-blue-fg',
};

interface AlertProps {
  tone?: Tone;
  title?: string;
  children: ReactNode;
  className?: string;
}

/** Aviso dentro de um formulário ou página. Erros são anunciados pelo leitor de tela. */
export function Alert({ tone = 'info', title, children, className }: AlertProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-control px-3.5 py-3 text-[13px] leading-relaxed',
        TONES[tone],
        className,
      )}
    >
      {title && <p className="font-semibold">{title}</p>}
      <div>{children}</div>
    </div>
  );
}

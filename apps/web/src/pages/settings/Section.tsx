import { cn } from '@trama/ui';
import { useId, type ReactNode } from 'react';

interface SectionProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Etapa futura: aparece no lugar, mas desligada. */
  disabled?: boolean;
}

/** Um bloco da tela de Configurações: título, explicação e o conteúdo. */
export function Section({ title, description, children, disabled }: SectionProps) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      aria-disabled={disabled || undefined}
      className={cn(
        'rounded-block border border-border-subtle bg-surface p-6',
        disabled && 'opacity-60',
      )}
    >
      <h2 id={id} className="text-[17px] font-semibold text-text-strong">
        {title}
      </h2>
      {description && <p className="mt-1 text-sm text-text-muted">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** "Salvo" ao lado do botão, anunciado pelo leitor de tela. */
export function SavedNote({ show }: { show: boolean }) {
  return (
    <span role="status" className="text-[13px] text-done-text">
      {show ? 'Salvo' : ''}
    </span>
  );
}

import { cn } from '@trama/ui';
import { useId, type ReactNode } from 'react';

interface SwitchProps {
  label: string;
  description?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

/** Liga/desliga com rótulo e explicação; preto e branco, sem cor de significado. */
export function Switch({ label, description, checked, disabled, onChange }: SwitchProps) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-6 py-3">
      <div className="min-w-0">
        <p id={`${id}-rotulo`} className="text-[15px] font-medium text-text-strong">
          {label}
        </p>
        {description && (
          <p id={`${id}-dica`} className="mt-0.5 text-sm text-text-muted">
            {description}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-rotulo`}
        aria-describedby={description ? `${id}-dica` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-6 w-10 shrink-0 rounded-full border transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-selection',
          'disabled:cursor-not-allowed disabled:opacity-60',
          checked ? 'border-text-strong bg-text-strong' : 'border-border bg-hover',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute top-0.5 size-4 rounded-full transition-[left] duration-150',
            checked ? 'left-[20px] bg-brand-ink' : 'left-0.5 bg-text-muted',
          )}
        />
      </button>
    </div>
  );
}

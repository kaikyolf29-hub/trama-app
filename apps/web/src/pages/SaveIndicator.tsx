import { cn } from '@trama/ui';
import type { SaveStatus } from '../api/autosave';

const SAVE_TEXT: Record<SaveStatus['kind'], string> = {
  saved: 'Salvo',
  pending: 'Alterações não salvas',
  saving: 'Salvando…',
  error: 'Não salvou',
};

/** O "● Salvo" da tela 1: verde quando está tudo guardado. Vale para o quadro e para o roteiro. */
export function SaveIndicator({ status }: { status: SaveStatus }) {
  const title =
    status.kind === 'error'
      ? `${status.message} Tentando de novo em ${Math.round(status.retryInMs / 1000)} s.`
      : undefined;
  return (
    <span
      role="status"
      aria-live="polite"
      title={title}
      className={cn(
        'ml-1 flex items-center gap-1.5 text-[13px]',
        status.kind === 'error' ? 'text-text-strong' : 'text-text-muted',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'size-1.5 rounded-full',
          status.kind === 'saved' && 'bg-done',
          (status.kind === 'pending' || status.kind === 'saving') && 'bg-text-muted',
          status.kind === 'error' && 'border border-text-strong',
        )}
      />
      {SAVE_TEXT[status.kind]}
    </span>
  );
}

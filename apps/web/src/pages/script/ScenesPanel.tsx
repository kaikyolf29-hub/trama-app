import { Link } from '@tanstack/react-router';
import type { Scene } from '@trama/core';
import { Alert, Button, cn } from '@trama/ui';
import { PlusIcon } from '@trama/ui/icons';
import { textLinkClass } from '../styles';

export interface BoardNotice {
  tone: 'info' | 'error';
  text: string;
  /** Se vier, a mensagem ganha o link "Abrir o quadro". */
  flowId?: string;
}

export type BoardAction = 'create' | 'bring' | 'fromBoard' | 'toBoard';

/**
 * "Cenas no fluxo" (tela 3): a lista de cenas, cada uma com o selo de quem já tem cartão, e os
 * quatro botões que levam as mudanças de um lado para o outro. Nada acontece sozinho.
 */
export function ScenesPanel({
  scenes,
  flowLinked,
  busy,
  notice,
  onSelect,
  onAdd,
  onAction,
}: {
  scenes: readonly Scene[];
  flowLinked: boolean;
  busy: BoardAction | null;
  notice: BoardNotice | null;
  onSelect: (sceneId: string) => void;
  onAdd: () => void;
  onAction: (action: BoardAction) => void;
}) {
  const disabled = busy !== null;
  return (
    <aside aria-labelledby="cenas-no-fluxo" className="flex w-full flex-col gap-4 xl:w-[264px]">
      <div className="flex flex-col gap-2">
        <h2 id="cenas-no-fluxo" className="text-sm font-semibold text-text-strong">
          Cenas no fluxo
        </h2>
        <p className="text-sm text-text-muted">
          Cada cena do roteiro vira um cartão no quadro, e vice-versa.
        </p>
      </div>

      <ol className="flex flex-col">
        {scenes.map((scene, index) => (
          <li key={scene.id} className="flex flex-col">
            {index > 0 && <span aria-hidden className="ml-4 h-4 w-0.5 bg-border" />}
            <button
              type="button"
              onClick={() => onSelect(scene.id)}
              className={cn(
                'flex min-h-10 w-full items-center justify-between gap-2 rounded-control border border-border-subtle bg-surface px-3 py-2 text-left text-sm text-text-strong transition-colors',
                'hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-selection',
              )}
            >
              <span className="truncate">
                {scene.title.trim() || 'Cena sem título'}
                {scene.time.trim() && (
                  <span className="text-text-muted"> · {scene.time.trim().split('–')[0]}</span>
                )}
              </span>
              {scene.cardId !== undefined && (
                <span className="shrink-0 rounded-tag bg-done-surface px-1.5 py-0.5 text-xs text-done-text">
                  No quadro
                </span>
              )}
            </button>
          </li>
        ))}
        {scenes.length > 0 && <span aria-hidden className="ml-4 h-4 w-0.5 bg-border" />}
        <li>
          <button
            type="button"
            onClick={onAdd}
            className="flex h-10 w-full items-center gap-2 rounded-control border border-dashed border-border px-3 text-sm text-text-muted transition-colors hover:bg-hover hover:text-text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-selection"
          >
            <PlusIcon size={14} aria-hidden />
            próxima cena
          </button>
        </li>
      </ol>

      <div className="flex flex-col gap-2 border-t border-border-subtle pt-4">
        <Button onClick={() => onAction('create')} loading={busy === 'create'} disabled={disabled}>
          Criar no quadro
        </Button>
        <Button
          variant="secondary"
          onClick={() => onAction('bring')}
          loading={busy === 'bring'}
          disabled={disabled || !flowLinked}
        >
          Trazer do quadro
        </Button>
        <Button
          variant="secondary"
          onClick={() => onAction('fromBoard')}
          loading={busy === 'fromBoard'}
          disabled={disabled || !flowLinked}
        >
          Atualizar do quadro
        </Button>
        <Button
          variant="secondary"
          onClick={() => onAction('toBoard')}
          loading={busy === 'toBoard'}
          disabled={disabled || !flowLinked}
        >
          Atualizar o quadro
        </Button>
        <p className="text-[13px] text-text-muted">
          Nada muda sozinho: escolha para que lado vão o título e a fala das cenas.
        </p>
      </div>

      {notice && (
        <div className="flex flex-col gap-2">
          <Alert tone={notice.tone}>{notice.text}</Alert>
          {notice.flowId && (
            <Link
              to="/p/$projectId"
              params={{ projectId: notice.flowId }}
              className={cn(textLinkClass, 'self-start text-sm')}
            >
              Abrir o quadro
            </Link>
          )}
        </div>
      )}
    </aside>
  );
}

import { cn } from '@trama/ui';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface MenuItem {
  label: string;
  /** Tecla mostrada à direita, ex.: "Ctrl+D". */
  shortcut?: string;
  onSelect: () => void;
  /** Linha separando do item anterior. */
  separated?: boolean;
}

/**
 * Menu do clique direito: aparece no ponto do clique, fecha com Esc, com um clique fora ou
 * depois de escolher. As setas do teclado andam pelos itens.
 */
export function ContextMenu({
  x,
  y,
  label,
  items,
  onClose,
}: {
  x: number;
  y: number;
  label: string;
  items: MenuItem[];
  onClose: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);

  // Perto da borda, o menu abre para o outro lado e nunca sai da tela.
  useLayoutEffect(() => {
    const element = menu.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    const margin = 8;
    const left = x + width + margin > window.innerWidth ? x - width : x;
    const top = y + height + margin > window.innerHeight ? y - height : y;
    element.style.left = `${Math.max(margin, left)}px`;
    element.style.top = `${Math.max(margin, top)}px`;
  }, [x, y]);

  useEffect(() => {
    menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, [onClose]);

  const move = (step: number) => {
    const buttons = Array.from(
      menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    );
    const index = buttons.findIndex((button) => button === document.activeElement);
    buttons.at((index + step) % buttons.length)?.focus();
  };

  return createPortal(
    <div
      ref={menu}
      role="menu"
      aria-label={label}
      className="fixed z-50 flex min-w-52 flex-col rounded-control border border-border bg-floating p-1 shadow-floating"
      style={{ left: x, top: y }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          move(event.key === 'ArrowDown' ? 1 : -1);
        }
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => (
        <div key={item.label} className={cn(item.separated && 'mt-1 border-t border-border pt-1')}>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              item.onSelect();
            }}
            className="flex h-8 w-full items-center justify-between gap-6 rounded-tag px-2.5 text-left text-[13px] text-text transition-colors hover:bg-hover hover:text-text-strong focus-visible:bg-hover focus-visible:text-text-strong focus-visible:outline-none"
          >
            {item.label}
            {item.shortcut && <span className="text-xs text-text-muted">{item.shortcut}</span>}
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

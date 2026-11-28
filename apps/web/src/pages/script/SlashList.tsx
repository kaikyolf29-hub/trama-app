import type { SuggestionProps } from '@tiptap/suggestion';
import { cn } from '@trama/ui';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import type { SlashItem } from './slash-items';

export interface SlashListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

/** O menu que aparece ao digitar "/": setas, Enter e clique escolhem. */
export const SlashList = forwardRef<SlashListHandle, SuggestionProps<SlashItem, SlashItem>>(
  function SlashList({ items, command }, ref) {
    const [selected, setSelected] = useState(0);
    useEffect(() => setSelected(0), [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: (event) => {
        if (items.length === 0) return false;
        if (event.key === 'ArrowDown') {
          setSelected((current) => (current + 1) % items.length);
          return true;
        }
        if (event.key === 'ArrowUp') {
          setSelected((current) => (current - 1 + items.length) % items.length);
          return true;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          const item = items[selected];
          if (item) command(item);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) return null;
    return (
      <div
        role="listbox"
        aria-label="Blocos de roteiro"
        className="z-20 w-72 rounded-block border border-border bg-floating p-1.5 shadow-floating"
      >
        <p className="px-3 pt-1.5 pb-1 text-[13px] text-text-muted">Blocos de roteiro</p>
        {items.map((item, index) => (
          <button
            key={item.label}
            type="button"
            role="option"
            aria-selected={index === selected}
            // `mousedown` evita que o clique tire o foco do editor antes de escolher.
            onMouseDown={(event) => {
              event.preventDefault();
              command(item);
            }}
            onMouseEnter={() => setSelected(index)}
            className={cn(
              'flex h-10 w-full items-center gap-2 rounded-control px-3 text-left text-[15px] text-text-strong',
              index === selected && 'bg-hover',
            )}
          >
            {item.label}
            {item.hint && <span className="text-[13px] text-text-muted">— {item.hint}</span>}
          </button>
        ))}
      </div>
    );
  },
);

import { flowBounds, type Block, type FlowContent, type NoteColor } from '@trama/core';
import { cn } from '@trama/ui';
import { fonts, textColors } from '@trama/ui/tokens';
import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Pré-visualização do fluxo que a IA montou: o mesmo layout que vai para o quadro (posições do
 * layout automático), em miniatura e sem edição. Não usa o React Flow: são caixas posicionadas
 * e um SVG para as setas, o suficiente para a pessoa conferir a ideia antes de inserir.
 */

/** Classes inteiras, para o Tailwind achá-las no código. */
const NOTE: Record<NoteColor, string> = {
  yellow: 'bg-note-yellow-bg text-note-yellow-fg',
  blue: 'bg-note-blue-bg text-note-blue-fg',
  green: 'bg-note-green-bg text-note-green-fg',
  pink: 'bg-note-pink-bg text-note-pink-fg',
};

/** Abaixo disto a miniatura fica pequena demais para ler; a área passa a rolar de lado. */
const MIN_SCALE = 0.5;

export function FlowPreview({ flow }: { flow: FlowContent }) {
  const box = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState<number | null>(null);
  const bounds = flowBounds(flow);

  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => setAvailable(element.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (!bounds) return null;
  const scale =
    available && available > 0 ? Math.min(1, Math.max(MIN_SCALE, available / bounds.width)) : 1;
  const origin = { x: bounds.x, y: bounds.y };
  const rect = (position: { x: number; y: number }, size: { width: number; height: number }) => ({
    left: position.x - origin.x,
    top: position.y - origin.y,
    width: size.width,
    height: size.height,
  });
  const nodes = new Map<string, { x: number; y: number; width: number; height: number }>([
    ...flow.blocks.map((b) => [b.id, { ...b.position, ...b.size }] as const),
    ...flow.frames.map((f) => [f.id, { ...f.position, ...f.size }] as const),
  ]);

  return (
    <div
      ref={box}
      role="img"
      aria-label={`Pré-visualização do fluxo: ${flow.blocks.length} blocos, ${flow.frames.length} molduras e ${flow.arrows.length} setas`}
      data-testid="flow-preview"
      className="w-full overflow-x-auto overflow-y-hidden"
    >
      <div style={{ width: bounds.width * scale, height: bounds.height * scale }}>
        <div
          className="relative origin-top-left"
          style={{
            width: bounds.width,
            height: bounds.height,
            transform: `scale(${String(scale)})`,
          }}
        >
          {flow.frames.map((frame) => (
            <div
              key={frame.id}
              data-node="frame"
              className="absolute rounded-block border border-frame-border bg-frame"
              style={rect(frame.position, frame.size)}
            >
              <p className="px-4 pt-3 text-[13px] font-semibold tracking-wider text-text-muted uppercase">
                {frame.title}
              </p>
            </div>
          ))}
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-0 text-arrow"
            width={bounds.width}
            height={bounds.height}
          >
            <defs>
              <marker
                id="preview-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="8"
                markerHeight="8"
                orient="auto-start-reverse"
              >
                <path d="M0 0L10 5L0 10z" fill="currentColor" />
              </marker>
            </defs>
            {flow.arrows.map((arrow) => {
              const from = nodes.get(arrow.from.nodeId);
              const to = nodes.get(arrow.to.nodeId);
              if (!from || !to) return null;
              const path = arrowPath(from, to, arrow.from.side, arrow.to.side, origin);
              return (
                <path
                  key={arrow.id}
                  d={path}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  markerEnd="url(#preview-arrow)"
                />
              );
            })}
          </svg>
          {flow.blocks.map((block) => (
            <div
              key={block.id}
              data-node="block"
              className="absolute overflow-hidden"
              style={rect(block.position, block.size)}
            >
              <PreviewBlock block={block} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type Box = { x: number; y: number; width: number; height: number };
type Side = 'top' | 'right' | 'bottom' | 'left' | undefined;

/** O meio da borda de um lado; sem lado, o lado voltado para o outro nó. */
function anchor(
  box: Box,
  side: Side,
  other: Box,
): { x: number; y: number; side: NonNullable<Side> } {
  const resolved: NonNullable<Side> =
    side ??
    (other.x >= box.x + box.width
      ? 'right'
      : other.x + other.width <= box.x
        ? 'left'
        : other.y >= box.y + box.height
          ? 'bottom'
          : 'top');
  switch (resolved) {
    case 'right':
      return { x: box.x + box.width, y: box.y + box.height / 2, side: resolved };
    case 'left':
      return { x: box.x, y: box.y + box.height / 2, side: resolved };
    case 'bottom':
      return { x: box.x + box.width / 2, y: box.y + box.height, side: resolved };
    case 'top':
      return { x: box.x + box.width / 2, y: box.y, side: resolved };
  }
}

/** Curva suave que sai do meio da borda, como as setas do quadro. */
function arrowPath(
  from: Box,
  to: Box,
  fromSide: Side,
  toSide: Side,
  origin: { x: number; y: number },
): string {
  const a = anchor(from, fromSide, to);
  const b = anchor(to, toSide, from);
  const pull = (point: { x: number; y: number; side: NonNullable<Side> }, distance: number) => {
    const dx = point.side === 'right' ? distance : point.side === 'left' ? -distance : 0;
    const dy = point.side === 'bottom' ? distance : point.side === 'top' ? -distance : 0;
    return { x: point.x + dx - origin.x, y: point.y + dy - origin.y };
  };
  const reach = Math.max(32, Math.min(120, Math.hypot(b.x - a.x, b.y - a.y) / 2));
  const c1 = pull(a, reach);
  const c2 = pull(b, reach);
  return `M ${String(a.x - origin.x)} ${String(a.y - origin.y)} C ${String(c1.x)} ${String(c1.y)}, ${String(c2.x)} ${String(c2.y)}, ${String(b.x - origin.x)} ${String(b.y - origin.y)}`;
}

function PreviewBlock({ block }: { block: Block }) {
  switch (block.type) {
    case 'card':
      return (
        <div className="h-full rounded-block border border-border bg-surface p-4 shadow-block">
          {block.tag && (
            <p className="text-xs font-semibold tracking-wider text-text-muted uppercase">
              {block.tag}
            </p>
          )}
          <p className="text-base font-semibold text-text-strong">{block.title}</p>
          {block.description && (
            <p className="mt-1 text-sm leading-snug text-text">{block.description}</p>
          )}
        </div>
      );
    case 'sticky':
      return (
        <div
          className={cn(
            'h-full rounded-tag p-3 text-sm leading-snug shadow-block',
            NOTE[block.color],
          )}
        >
          {block.text}
        </div>
      );
    case 'text':
      return (
        <p
          className="whitespace-pre-wrap"
          style={{
            fontFamily: fonts[block.font],
            fontSize: block.fontSize,
            color: textColors[block.color],
            fontWeight: block.bold ? 700 : 400,
            fontStyle: block.italic ? 'italic' : 'normal',
            lineHeight: 1.35,
          }}
        >
          {block.text}
        </p>
      );
    case 'shape':
      return (
        <div
          className={cn(
            'flex h-full items-center justify-center border border-border bg-surface p-3 text-center text-sm text-text-strong shadow-block',
            block.shape === 'ellipse' ? 'rounded-full' : 'rounded-control',
            block.shape === 'diamond' && '[clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)]',
          )}
        >
          {block.text}
        </div>
      );
    case 'checklist':
      return (
        <div className="h-full rounded-block border border-border bg-surface p-4 shadow-block">
          <p className="text-sm font-semibold text-text-strong">{block.title}</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {block.items.map((item) => (
              <li key={item.id} className="flex items-start gap-2 text-sm text-text">
                <span
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 rounded-tag border border-border"
                />
                {item.text}
              </li>
            ))}
          </ul>
        </div>
      );
    default:
      return null;
  }
}

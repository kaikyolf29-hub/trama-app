import type { Arrow } from '@trama/core';
import { cn } from '@trama/ui';
import { colors } from '@trama/ui/tokens';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getStraightPath,
  useReactFlow,
  type EdgeProps,
} from '@xyflow/react';
import { useCanvas } from './canvas-context';
import type { CanvasEdge } from './convert';
import { EditableText } from './EditableText';

const floating = 'rounded-control border border-border bg-floating shadow-floating';

/**
 * Seta do quadro: sai do meio da borda, curva ou reta, com texto opcional no meio. Selecionada,
 * mostra uma barrinha para trocar o traço, escrever e apagar.
 */
export function ArrowEdge({
  id,
  data,
  selected,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
}: EdgeProps<CanvasEdge>) {
  const { editingId, startEditing, stopEditing, updateArrow } = useCanvas();
  const { deleteElements } = useReactFlow();
  const arrow = data?.arrow;
  if (!arrow) return null;

  const [path, labelX, labelY] =
    arrow.route === 'straight'
      ? getStraightPath({ sourceX, sourceY, targetX, targetY })
      : getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const editing = editingId === id;
  // Acima dos blocos: a camada dos rótulos fica embaixo da dos nós no React Flow (e um bloco
  // selecionado sobe 1000).
  const at = (dy: number, zIndex: number) => ({
    transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY + dy}px)`,
    zIndex,
  });
  const setRoute = (route: Arrow['route']) => updateArrow({ ...arrow, route });

  return (
    <>
      <BaseEdge
        path={path}
        markerEnd={markerEnd}
        interactionWidth={24}
        style={{ stroke: selected ? colors.selection : colors.arrow, strokeWidth: 1.5 }}
      />
      <EdgeLabelRenderer>
        {(arrow.label || editing) && (
          <div
            className="nodrag nopan pointer-events-auto absolute max-w-60 rounded-tag bg-canvas px-1.5 py-0.5 text-center text-xs text-text"
            style={at(0, 1500)}
            onDoubleClick={() => startEditing(id)}
          >
            <EditableText
              singleLine
              value={arrow.label ?? ''}
              editing={editing}
              label="Texto da seta"
              placeholder="Texto da seta"
              onCommit={(text) => {
                const { label: _old, ...rest } = arrow;
                updateArrow(text.trim() ? { ...rest, label: text.trim() } : rest);
                stopEditing();
              }}
              className="w-48 text-center text-xs text-text-strong"
            >
              <span>{arrow.label}</span>
            </EditableText>
          </div>
        )}
        {selected && !editing && (
          <div
            role="toolbar"
            aria-label="Seta"
            className={cn('nodrag nopan pointer-events-auto absolute flex gap-0.5 p-0.5', floating)}
            style={at(arrow.label ? -32 : -24, 2500)}
          >
            {(
              [
                ['curved', 'Curva'],
                ['straight', 'Reta'],
              ] as const
            ).map(([route, name]) => (
              <button
                key={route}
                type="button"
                aria-pressed={arrow.route === route}
                onClick={() => setRoute(route)}
                className={cn(
                  'h-7 rounded-tag px-2 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-selection',
                  arrow.route === route
                    ? 'bg-border text-text-strong'
                    : 'text-text hover:bg-hover hover:text-text-strong',
                )}
              >
                {name}
              </button>
            ))}
            <span className="mx-0.5 my-1 w-px bg-border" aria-hidden />
            <button
              type="button"
              onClick={() => startEditing(id)}
              className="h-7 rounded-tag px-2 text-xs text-text transition-colors hover:bg-hover hover:text-text-strong focus-visible:outline-2 focus-visible:outline-selection"
            >
              Texto
            </button>
            <button
              type="button"
              onClick={() => void deleteElements({ edges: [{ id }] })}
              className="h-7 rounded-tag px-2 text-xs text-text transition-colors hover:bg-hover hover:text-text-strong focus-visible:outline-2 focus-visible:outline-selection"
            >
              Apagar
            </button>
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

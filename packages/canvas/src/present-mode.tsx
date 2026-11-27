import type { FlowContent } from '@trama/core';
import { cn } from '@trama/ui';
import { NextIcon, PreviousIcon } from '@trama/ui/icons';
import { colors } from '@trama/ui/tokens';
import { MarkerType, ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { CanvasContext, type CanvasActions } from './canvas-context';
import { arrowToEdge, toReactFlow, type CanvasEdge } from './convert';
import type { CanvasMedia } from './media';
import { edgeTypes } from './node-types';
import { extendStroke, strokePath, type PenStroke } from './pen';
import {
  arrowDimmed,
  arrowVisible,
  boardBounds,
  cameraFor,
  clampStep,
  presentStates,
  stepBounds,
  stepName,
  type CameraOptions,
} from './present';
import {
  PresentBlockNode,
  PresentFrameNode,
  type PresentNode,
  type PresentNodeData,
} from './present-nodes';

const presentNodeTypes = { pblock: PresentBlockNode, pframe: PresentFrameNode };

/** A câmera anda até o passo em ~600 ms. */
export const CAMERA_MS = 600;
/** Folga em volta do passo: em cima e embaixo ficam o título e os controles (tela 2). */
const CAMERA: CameraOptions = {
  padding: { top: 120, right: 96, bottom: 136, left: 96 },
  minZoom: 0.05,
  maxZoom: 1,
};
const PEN_WIDTH = 3;

/** Quem pediu menos movimento no sistema: a câmera pula direto para o passo. */
function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/** O tamanho da área de apresentação (a janela toda, em tela cheia). */
function sizeOf(element: HTMLElement | null): { width: number; height: number } {
  return {
    width: element?.clientWidth || window.innerWidth,
    height: element?.clientHeight || window.innerHeight,
  };
}

type Tool = 'pen' | 'laser' | null;

export interface PresenterProps {
  /** Foto do fluxo na hora de apresentar: nada do que acontece aqui volta para o fluxo. */
  flow: FlowContent;
  /** Nome do projeto, no canto de cima. */
  title?: string;
  media: CanvasMedia;
  onExit: () => void;
}

const noop = () => undefined;

/**
 * O modo aula (tela 2): tela cheia, a câmera anda até cada passo, os passos que ainda não
 * chegaram ficam ocultos e o de agora ganha destaque. Setas do teclado avançam e voltam, Esc
 * sai. A caneta e o destaque servem só aqui: nada é gravado no fluxo.
 */
export function Presenter(props: PresenterProps) {
  return createPortal(
    <ReactFlowProvider>
      <PresenterView {...props} />
    </ReactFlowProvider>,
    document.body,
  );
}

function PresenterView({ flow, title, media, onExit }: PresenterProps) {
  const root = useRef<HTMLDivElement>(null);
  const stepCount = flow.presentation.length;
  const [step, setStep] = useState(0);
  const [tool, setTool] = useState<Tool>(null);
  const [strokes, setStrokes] = useState<PenStroke[]>([]);

  const go = useCallback(
    (next: number) => {
      const target = clampStep(next, stepCount);
      if (target === step) return;
      // A caneta vale para o passo em que foi usada: ao trocar de passo, o desenho some.
      setStrokes([]);
      setStep(target);
    },
    [step, stepCount],
  );

  // Tela cheia ao abrir. Se o navegador recusar, a apresentação segue numa camada sobre a
  // página, e Esc sai do mesmo jeito. Sair da tela cheia pelo navegador (Esc) sai do modo aula.
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let entered = false;
    const onChange = () => {
      if (document.fullscreenElement === element) entered = true;
      else if (entered) onExit();
    };
    document.addEventListener('fullscreenchange', onChange);
    if (document.fullscreenEnabled && element.requestFullscreen) {
      element.requestFullscreen().catch(noop);
    }
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      if (document.fullscreenElement === element) document.exitFullscreen().catch(noop);
    };
  }, [onExit]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      // Espaço em cima de um botão aperta o botão: não avança duas vezes.
      const onControl =
        event.target instanceof HTMLElement &&
        ['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName);
      const key = event.key;
      const act = (action: () => void) => {
        event.preventDefault();
        action();
      };
      if (key === 'Escape') act(onExit);
      else if (['ArrowRight', 'ArrowDown', 'PageDown'].includes(key)) act(() => go(step + 1));
      else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(key)) act(() => go(step - 1));
      else if (key === ' ' && !onControl) act(() => go(event.shiftKey ? step - 1 : step + 1));
      else if (key === 'Home') act(() => go(0));
      else if (key === 'End') act(() => go(stepCount - 1));
      else if (key.toLowerCase() === 'p') act(() => setTool((t) => (t === 'pen' ? null : 'pen')));
      else if (key.toLowerCase() === 'l') {
        act(() => setTool((t) => (t === 'laser' ? null : 'laser')));
      } else if (key === 'Delete' || key === 'Backspace') act(() => setStrokes([]));
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [go, onExit, step, stepCount]);

  // Quem lê o quadro por voz ouve em que passo está.
  const current = flow.presentation[step];
  const announcement = current
    ? `Passo ${step + 1} de ${stepCount}: ${stepName(flow, current)}`
    : '';

  const actions = useMemo<CanvasActions>(
    () => ({
      editingId: null,
      startEditing: noop,
      stopEditing: noop,
      // Só leitura: marcar uma etapa na aula não muda o fluxo.
      updateBlock: noop,
      updateFrame: noop,
      updateArrow: noop,
      stepOf: () => undefined,
      stepCount,
      setStep: noop,
      removeNode: noop,
      resolveImage: media.resolveImage,
    }),
    [media, stepCount],
  );

  return (
    <CanvasContext.Provider value={actions}>
      <div
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-label="Modo aula"
        data-testid="apresentacao"
        className="fixed inset-0 z-50 overflow-hidden bg-canvas text-text"
      >
        <Stage flow={flow} step={step} root={root} laser={tool === 'laser'} />
        <PenLayer
          active={tool === 'pen'}
          strokes={strokes}
          onStroke={(stroke) => setStrokes((all) => [...all, stroke])}
        />
        {tool === 'laser' && <LaserDot root={root} />}
        <p role="status" className="sr-only">
          {announcement}
        </p>
        <TopBar title={title} onExit={onExit} />
        <BottomBar
          step={step}
          count={stepCount}
          tool={tool}
          hasStrokes={strokes.length > 0}
          onGo={go}
          onTool={(next) => setTool((t) => (t === next ? null : next))}
          onClear={() => setStrokes([])}
        />
      </div>
    </CanvasContext.Provider>
  );
}

/** O quadro de verdade, só para ver: cada nó no estado do passo, e a câmera andando. */
function Stage({
  flow,
  step,
  root,
  laser,
}: {
  flow: FlowContent;
  step: number;
  root: RefObject<HTMLDivElement | null>;
  laser: boolean;
}) {
  const reactFlow = useReactFlow<PresentNode, CanvasEdge>();
  const stepCount = flow.presentation.length;
  const states = useMemo(() => presentStates(flow, step), [flow, step]);

  const { nodes, edges } = useMemo(() => {
    const base = toReactFlow(flow);
    const nodes = base.nodes.map((node): PresentNode => {
      const state = states.get(node.id) ?? { kind: 'free' as const };
      const data: PresentNodeData =
        node.data.kind === 'frame'
          ? { frame: node.data.frame, state }
          : { block: node.data.block, state };
      return {
        id: node.id,
        type: node.type === 'frame' ? 'pframe' : 'pblock',
        position: node.position,
        ...(node.parentId ? { parentId: node.parentId } : {}),
        width: node.width,
        height: node.height,
        zIndex: node.zIndex,
        draggable: false,
        selectable: false,
        connectable: false,
        focusable: false,
        hidden: state.kind === 'future' && !state.placeholder,
        data,
      };
    });
    const edges = flow.arrows.map((arrow): CanvasEdge => {
      const edge = arrowToEdge(arrow);
      const visible = arrowVisible(states, arrow.from.nodeId, arrow.to.nodeId);
      const dimmed = arrowDimmed(states, arrow.from.nodeId, arrow.to.nodeId);
      return {
        ...edge,
        selectable: false,
        focusable: false,
        hidden: !visible,
        ...(dimmed ? { className: 'trama-dim' } : {}),
      };
    });
    return { nodes, edges };
  }, [flow, states]);

  /** A câmera que enquadra o passo (ou o quadro todo, sem passos) numa tela deste tamanho. */
  const cameraOf = useCallback(
    (screen: { width: number; height: number }) => {
      const bounds = stepCount > 0 ? stepBounds(flow, step) : boardBounds(flow);
      return bounds ? cameraFor(bounds, screen, CAMERA) : null;
    },
    [flow, step, stepCount],
  );
  const first = useRef(true);
  useEffect(() => {
    const camera = cameraOf(sizeOf(root.current));
    if (!camera) return;
    // A primeira câmera já nasce no lugar (defaultViewport); depois, anda suave.
    const duration = first.current || reducedMotion() ? 0 : CAMERA_MS;
    first.current = false;
    void reactFlow.setViewport(camera, { duration });
  }, [cameraOf, reactFlow, root]);

  // Tela cheia (ou janela redimensionada): enquadra de novo, sem animação.
  useEffect(() => {
    const element = root.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const camera = cameraOf(sizeOf(root.current));
      if (camera) void reactFlow.setViewport(camera, { duration: 0 });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [cameraOf, reactFlow, root]);

  // O quadro nasce já na câmera do passo (a tela cheia cobre a janela toda).
  const [initial] = useState(() =>
    cameraOf({ width: window.innerWidth, height: window.innerHeight }),
  );

  return (
    <div className={cn('absolute inset-0', laser && 'cursor-none')}>
      <ReactFlow<PresentNode, CanvasEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={presentNodeTypes}
        edgeTypes={edgeTypes}
        {...(initial ? { defaultViewport: initial } : {})}
        // Só leitura. O clique vazio no nó deixa o ponteiro passar (vídeo toca aqui mesmo).
        onNodeClick={noop}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        panOnDrag={false}
        panOnScroll={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        deleteKeyCode={null}
        selectionKeyCode={null}
        minZoom={CAMERA.minZoom}
        maxZoom={4}
        defaultEdgeOptions={{
          type: 'arrow',
          markerEnd: { type: MarkerType.ArrowClosed, color: colors.arrow, width: 14, height: 14 },
        }}
        proOptions={{ hideAttribution: true }}
        aria-label="Quadro em apresentação"
      />
    </div>
  );
}

/** Canto de cima: "MODO AULA · nome" e a saída (tela 2). */
function TopBar({ title, onExit }: { title?: string; onExit: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-4 px-6 py-4 sm:px-8">
      <p className="pointer-events-auto flex min-w-0 items-baseline gap-3 text-sm text-text-strong">
        <span className="text-[13px] font-semibold tracking-[0.08em] text-text-muted">
          MODO AULA
        </span>
        {title && (
          <>
            <span className="text-text-muted" aria-hidden>
              ·
            </span>
            <span className="truncate">{title}</span>
          </>
        )}
      </p>
      <div className="pointer-events-auto flex shrink-0 items-center gap-4">
        <span className="hidden text-[13px] text-text-muted md:inline">
          Esc para sair · ← → para avançar
        </span>
        <button
          type="button"
          onClick={onExit}
          className="h-10 rounded-control border border-border px-4 text-sm text-text-strong transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-selection"
        >
          Voltar ao editor
        </button>
      </div>
    </div>
  );
}

const hudButton =
  'h-10 rounded-control border px-4 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-selection';

/** Controles de baixo (tela 2): voltar, o andamento, avançar, e a caneta e o destaque. */
function BottomBar({
  step,
  count,
  tool,
  hasStrokes,
  onGo,
  onTool,
  onClear,
}: {
  step: number;
  count: number;
  tool: Tool;
  hasStrokes: boolean;
  onGo: (step: number) => void;
  onTool: (tool: 'pen' | 'laser') => void;
  onClear: () => void;
}) {
  const toggle = (active: boolean) =>
    cn(
      hudButton,
      active
        ? 'border-selection bg-hover text-text-strong'
        : 'border-border text-text hover:bg-hover hover:text-text-strong',
    );
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-4 pb-8 [&>*]:pointer-events-auto">
      {count === 0 && (
        <p className="max-w-md rounded-block border border-border bg-floating px-4 py-3 text-center text-[13px] text-text shadow-floating">
          Este quadro ainda não tem passos, então aparece inteiro. Para montar a aula, volte ao
          editor, escolha um bloco e use &ldquo;Aula: passo&rdquo; na barra dele, ou abra
          &ldquo;Ordem da apresentação&rdquo;.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {count > 0 && (
          <>
            <button
              type="button"
              aria-label="Passo anterior"
              title="Passo anterior (←)"
              disabled={step === 0}
              onClick={() => onGo(step - 1)}
              className="flex size-10 items-center justify-center rounded-control border border-border bg-surface text-text-strong transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-selection disabled:cursor-not-allowed disabled:text-text-muted disabled:hover:bg-surface"
            >
              <PreviousIcon size={18} aria-hidden />
            </button>
            <div className="mx-2 flex items-center gap-1.5" aria-hidden>
              {Array.from({ length: count }, (_, index) => (
                <span
                  key={index}
                  className={cn(
                    'h-1 w-6 rounded-full transition-colors duration-150',
                    index <= step ? 'bg-text-strong' : 'bg-border',
                  )}
                />
              ))}
            </div>
            <span className="mr-1 text-sm text-text-strong tabular-nums">
              Passo {step + 1} de {count}
            </span>
            <button
              type="button"
              aria-label="Próximo passo"
              title="Próximo passo (→)"
              disabled={step >= count - 1}
              onClick={() => onGo(step + 1)}
              className="flex size-10 items-center justify-center rounded-control bg-text-strong text-brand-ink transition-colors hover:bg-brand-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-selection disabled:cursor-not-allowed disabled:bg-border disabled:text-text-muted"
            >
              <NextIcon size={18} aria-hidden />
            </button>
            <span className="mx-1 h-8 w-px bg-border" aria-hidden />
          </>
        )}
        <button
          type="button"
          aria-pressed={tool === 'laser'}
          title="Um ponteiro grande que segue o mouse (L)"
          onClick={() => onTool('laser')}
          className={toggle(tool === 'laser')}
        >
          Destaque
        </button>
        <button
          type="button"
          aria-pressed={tool === 'pen'}
          title="Desenhar por cima do quadro (P)"
          onClick={() => onTool('pen')}
          className={toggle(tool === 'pen')}
        >
          Caneta
        </button>
        {hasStrokes && (
          <button
            type="button"
            title="Apagar o desenho (Delete)"
            onClick={onClear}
            className={toggle(false)}
          >
            Limpar
          </button>
        )}
      </div>
    </div>
  );
}

/** A caneta: um desenho fino por cima do quadro, na cor de seleção, que não vai para o fluxo. */
function PenLayer({
  active,
  strokes,
  onStroke,
}: {
  active: boolean;
  strokes: readonly PenStroke[];
  onStroke: (stroke: PenStroke) => void;
}) {
  const [drawing, setDrawing] = useState<PenStroke | null>(null);
  const point = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const finish = () => {
    if (drawing) onStroke(drawing);
    setDrawing(null);
  };
  return (
    <svg
      aria-hidden
      data-testid="caneta"
      className={cn(
        'absolute inset-0 size-full',
        active ? 'cursor-crosshair touch-none' : 'pointer-events-none',
      )}
      onPointerDown={(event) => {
        if (!active || event.button !== 0) return;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setDrawing([point(event)]);
      }}
      onPointerMove={(event) => {
        if (drawing) setDrawing(extendStroke(drawing, point(event)));
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
    >
      {[...strokes, ...(drawing ? [drawing] : [])].map((stroke, index) => (
        <path
          key={index}
          d={strokePath(stroke)}
          fill="none"
          stroke={colors.selection}
          strokeWidth={PEN_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

/** O destaque: um anel que segue o ponteiro, para mostrar onde olhar. Sem brilho nem sombra. */
function LaserDot({ root }: { root: RefObject<HTMLDivElement | null> }) {
  const dot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const move = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      if (dot.current) {
        dot.current.style.transform = `translate(${event.clientX - rect.left}px, ${event.clientY - rect.top}px)`;
        dot.current.style.opacity = '1';
      }
    };
    const leave = () => {
      if (dot.current) dot.current.style.opacity = '0';
    };
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerleave', leave);
    return () => {
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerleave', leave);
    };
  }, [root]);
  return (
    <div
      ref={dot}
      aria-hidden
      data-testid="destaque"
      className="pointer-events-none absolute top-0 left-0 opacity-0"
    >
      <div className="-mt-5 -ml-5 size-10 rounded-full border-2 border-selection bg-selection/25" />
    </div>
  );
}

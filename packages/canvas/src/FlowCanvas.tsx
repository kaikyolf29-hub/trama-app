import type { Block, FlowContent, Frame } from '@trama/core';
import { cn } from '@trama/ui';
import {
  AiIcon,
  ArrowIcon,
  FrameIcon,
  ImageIcon,
  PanIcon,
  SelectIcon,
  ShapeIcon,
  StickyIcon,
  TextIcon,
  VideoIcon,
  VoiceIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '@trama/ui/icons';
import { colors, GRID } from '@trama/ui/tokens';
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useViewport,
  type EdgeChangeset,
  type NodeChangeset,
} from '@xyflow/react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { CanvasContext, type CanvasActions } from './canvas-context';
import {
  blockToNode,
  frameToNode,
  fromReactFlow,
  toReactFlow,
  type CanvasEdge,
  type CanvasNode,
} from './convert';
import { createBlock, createFrame, type CreatableKind } from './create';
import { nodeTypes } from './node-types';
import { removeNodes } from './remove';

/** Selecionar, mover o quadro, ou criar um tipo de bloco no próximo clique. */
export type CanvasTool = 'select' | 'pan' | CreatableKind;

export interface FlowCanvasProps {
  /** Conteúdo inicial. Depois disso o quadro guarda o estado e avisa cada mudança. */
  flow: FlowContent;
  /** Chamado a cada mudança (mover, criar, editar, apagar), já na grade de 8 px. */
  onFlowChange?: (flow: FlowContent) => void;
  /** Barras do app por cima do quadro (título, compartilhar, apresentar...). */
  topLeft?: ReactNode;
  topRight?: ReactNode;
}

// Deixa espaço para as barras flutuantes: ferramentas à esquerda, título em cima, zoom embaixo.
const FIT_VIEW = {
  padding: { top: '88px', right: '48px', bottom: '72px', left: '96px' },
  duration: 150,
} as const;
// Distância das barras flutuantes até a borda da tela (16 px, como na tela 1).
const PANEL = 'm-4!';
const ARROW_STYLE = { stroke: colors.arrow, strokeWidth: 1.5 };
const DELETE_KEYS = ['Backspace', 'Delete'];

/** Teclas que escolhem a ferramenta (docs/PLAN.md, "Blocos" e "Interações"). */
const SHORTCUTS: Partial<Record<string, CanvasTool>> = {
  v: 'select',
  h: 'pan',
  t: 'text',
  c: 'card',
  n: 'sticky',
  r: 'shape',
  f: 'frame',
};

/** O quadro do Trama (tela 1): tela cheia, ferramentas flutuando, grade de 8 px. */
export function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}

/** A pessoa está digitando num campo: os atalhos de uma letra ficam quietos. */
function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

function Canvas({ flow, onFlowChange, topLeft, topRight }: FlowCanvasProps) {
  const initial = useMemo(() => toReactFlow(flow), [flow]);
  const [nodes, setNodes] = useState<CanvasNode[]>(initial.nodes);
  const [edges, setEdges] = useState<CanvasEdge[]>(initial.edges);
  const [tool, setTool] = useState<CanvasTool>('select');
  const [editingId, setEditingId] = useState<string | null>(null);
  const reactFlow = useReactFlow<CanvasNode, CanvasEdge>();
  // O conteúdo do fluxo fica numa ref: os eventos leem e gravam sem esperar uma renderização.
  const content = useRef(flow);

  /** Guarda o novo conteúdo, com as posições atuais dos nós, e avisa quem usa o quadro. */
  const commit = useCallback(
    (next: FlowContent, nodesNow: CanvasNode[] = reactFlow.getNodes()) => {
      content.current = fromReactFlow(next, nodesNow);
      onFlowChange?.(content.current);
    },
    [onFlowChange, reactFlow],
  );

  const updateBlock = useCallback(
    (next: Block) => {
      setNodes((current) =>
        current.map((node) =>
          node.id === next.id && node.type === 'block'
            ? { ...node, data: { kind: 'block', block: next } }
            : node,
        ),
      );
      const base = content.current;
      commit({
        ...base,
        blocks: base.blocks.map((block) => (block.id === next.id ? next : block)),
      });
    },
    [commit],
  );

  const updateFrame = useCallback(
    (next: Frame) => {
      setNodes((current) =>
        current.map((node) =>
          node.id === next.id && node.type === 'frame'
            ? { ...node, data: { kind: 'frame', frame: next } }
            : node,
        ),
      );
      const base = content.current;
      commit({
        ...base,
        frames: base.frames.map((frame) => (frame.id === next.id ? next : frame)),
      });
    },
    [commit],
  );

  /** Cria um bloco (ou moldura) onde a pessoa clicou, já selecionado e em edição. */
  const create = useCallback(
    (kind: CreatableKind, screen: { x: number; y: number }) => {
      const at = reactFlow.screenToFlowPosition(screen);
      const base = content.current;
      const unselected = (current: CanvasNode[]) =>
        current.map((node) => (node.selected ? { ...node, selected: false } : node));
      if (kind === 'frame') {
        const frame = createFrame(at);
        // Molduras vão no começo da lista: o React Flow pede pais antes dos filhos.
        setNodes((current) => [{ ...frameToNode(frame), selected: true }, ...unselected(current)]);
        commit({ ...base, frames: [...base.frames, frame] });
        setEditingId(frame.id);
      } else {
        const block = createBlock(kind, at);
        setNodes((current) => [...unselected(current), { ...blockToNode(block), selected: true }]);
        commit({ ...base, blocks: [...base.blocks, block] });
        setEditingId(block.id);
      }
      setTool('select');
    },
    [commit, reactFlow],
  );

  const onNodesChange = useCallback((changes: NodeChangeset<CanvasNode>) => {
    setNodes((current) => changes.applyTo(current));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChangeset<CanvasEdge>) => {
    setEdges((current) => changes.applyTo(current));
  }, []);

  const onNodeDragStop = useCallback(() => commit(content.current), [commit]);

  // Delete ou Backspace: some com os nós (e os filhos de uma moldura) e com o que apontava para eles.
  const onDelete = useCallback(
    ({ nodes: removed, edges: removedEdges }: { nodes: CanvasNode[]; edges: CanvasEdge[] }) => {
      const ids = new Set([...removed, ...removedEdges].map((item) => item.id));
      const remaining = reactFlow.getNodes().filter((node) => !ids.has(node.id));
      commit(removeNodes(content.current, ids), remaining);
    },
    [commit, reactFlow],
  );

  const onPaneClick = useCallback(
    (event: MouseEvent) => {
      if (tool !== 'select' && tool !== 'pan') create(tool, { x: event.clientX, y: event.clientY });
    },
    [tool, create],
  );

  // Clique duplo num ponto vazio do quadro cria um texto (docs/PLAN.md, "Blocos").
  const onDoubleClick = useCallback(
    (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.classList.contains('react-flow__pane')) {
        create('text', { x: event.clientX, y: event.clientY });
      }
    },
    [create],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'Escape') {
        setTool('select');
        return;
      }
      const next = SHORTCUTS[event.key.toLowerCase()];
      if (next) {
        event.preventDefault();
        setTool(next);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const actions = useMemo<CanvasActions>(
    () => ({
      editingId,
      startEditing: setEditingId,
      stopEditing: () => setEditingId(null),
      updateBlock,
      updateFrame,
    }),
    [editingId, updateBlock, updateFrame],
  );

  const panning = tool === 'pan';
  const creating = tool !== 'select' && !panning;

  return (
    <CanvasContext.Provider value={actions}>
      <div
        className="trama-canvas relative size-full bg-canvas"
        data-testid="quadro"
        data-creating={creating || undefined}
        onDoubleClick={onDoubleClick}
      >
        <ReactFlow<CanvasNode, CanvasEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={onNodeDragStop}
          onDelete={onDelete}
          onPaneClick={onPaneClick}
          deleteKeyCode={DELETE_KEYS}
          connectionMode={ConnectionMode.Loose}
          snapToGrid
          snapGrid={[GRID, GRID]}
          fitView
          fitViewOptions={FIT_VIEW}
          minZoom={0.1}
          maxZoom={4}
          panOnDrag={panning ? true : [1, 2]}
          selectionOnDrag={!panning}
          panOnScroll={false}
          zoomOnScroll
          zoomOnPinch
          zoomOnDoubleClick={false}
          defaultEdgeOptions={{
            style: ARROW_STYLE,
            markerEnd: { type: MarkerType.ArrowClosed, color: colors.arrow, width: 14, height: 14 },
          }}
          proOptions={{ hideAttribution: true }}
          aria-label="Quadro"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1}
            color={colors.canvasDot}
            bgColor={colors.canvas}
          />
          {topLeft && (
            <Panel position="top-left" className={PANEL}>
              {topLeft}
            </Panel>
          )}
          {topRight && (
            <Panel position="top-right" className={PANEL}>
              {topRight}
            </Panel>
          )}
          <Panel position="center-left" className={PANEL}>
            <Tools tool={tool} onToolChange={setTool} />
          </Panel>
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            ariaLabel="Minimapa"
            bgColor={colors.floating}
            maskColor={colors.overlay}
            nodeColor={colors.hover}
            nodeStrokeWidth={0}
            nodeBorderRadius={3}
            className="m-4! mb-16!"
            style={{ borderRadius: 10, border: `1px solid ${colors.border}` }}
          />
          <Panel position="bottom-right" className={PANEL}>
            <ZoomControls />
          </Panel>
        </ReactFlow>
      </div>
    </CanvasContext.Provider>
  );
}

type ToolButton = {
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>;
  tool?: CanvasTool;
  /** Tecla de atalho, mostrada na dica. */
  shortcut?: string;
};

// Na ordem da tela 1. O cartão não tem botão na barra: entra pela tecla C.
const TOOLS: ToolButton[] = [
  { label: 'Selecionar', icon: SelectIcon, tool: 'select', shortcut: 'V' },
  { label: 'Mover quadro', icon: PanIcon, tool: 'pan', shortcut: 'H' },
  { label: 'Texto', icon: TextIcon, tool: 'text', shortcut: 'T' },
  { label: 'Nota adesiva', icon: StickyIcon, tool: 'sticky', shortcut: 'N' },
  { label: 'Forma', icon: ShapeIcon, tool: 'shape', shortcut: 'R' },
  { label: 'Seta', icon: ArrowIcon },
  { label: 'Imagem', icon: ImageIcon },
  { label: 'Vídeo ou link', icon: VideoIcon },
  { label: 'Moldura', icon: FrameIcon, tool: 'frame', shortcut: 'F' },
];

const LATER_TOOLS: ToolButton[] = [
  { label: 'Falar e organizar', icon: VoiceIcon },
  { label: 'Organizar com IA', icon: AiIcon },
];

const floatingPanel = 'rounded-block border border-border bg-floating shadow-floating';

function ToolIconButton({
  item,
  active,
  onClick,
}: {
  item: ToolButton;
  active?: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  const available = Boolean(onClick);
  const hint = !available
    ? `${item.label} (em breve)`
    : item.shortcut
      ? `${item.label} (${item.shortcut})`
      : item.label;
  return (
    <button
      type="button"
      aria-label={item.label}
      aria-keyshortcuts={item.shortcut}
      title={hint}
      aria-pressed={item.tool ? active : undefined}
      disabled={!available}
      onClick={onClick}
      className={cn(
        'flex size-[38px] items-center justify-center rounded-control text-text transition-colors',
        'focus-visible:outline-2 focus-visible:outline-selection',
        active ? 'bg-border text-text-strong' : 'hover:bg-hover hover:text-text-strong',
        !available && 'cursor-not-allowed opacity-40 hover:bg-transparent',
      )}
    >
      <Icon size={18} strokeWidth={1.75} aria-hidden />
    </button>
  );
}

function Tools({
  tool,
  onToolChange,
}: {
  tool: CanvasTool;
  onToolChange: (tool: CanvasTool) => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Ferramentas"
      className={cn('flex w-12 flex-col gap-0.5 p-1', floatingPanel)}
    >
      {TOOLS.map((item) => (
        <ToolIconButton
          key={item.label}
          item={item}
          active={item.tool === tool}
          onClick={item.tool ? () => onToolChange(item.tool as CanvasTool) : undefined}
        />
      ))}
      <span className="mx-1.5 my-1 h-px bg-border" aria-hidden />
      {LATER_TOOLS.map((item) => (
        <ToolIconButton key={item.label} item={item} />
      ))}
    </div>
  );
}

function ZoomControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const { zoom } = useViewport();
  const button =
    'flex h-7 items-center justify-center rounded-tag px-2 text-text transition-colors hover:bg-hover hover:text-text-strong focus-visible:outline-2 focus-visible:outline-selection';
  return (
    <div className={cn('flex h-9 items-center gap-0.5 px-1 text-xs', floatingPanel)}>
      <button
        type="button"
        aria-label="Diminuir zoom"
        className={button}
        onClick={() => void zoomOut({ duration: 150 })}
      >
        <ZoomOutIcon size={14} aria-hidden />
      </button>
      <span className="w-11 text-center text-text tabular-nums" aria-live="polite">
        {Math.round(zoom * 100)}%
      </span>
      <button
        type="button"
        aria-label="Aumentar zoom"
        className={button}
        onClick={() => void zoomIn({ duration: 150 })}
      >
        <ZoomInIcon size={14} aria-hidden />
      </button>
      <span className="mx-1 h-4 w-px bg-border" aria-hidden />
      <button type="button" className={button} onClick={() => void fitView(FIT_VIEW)}>
        Ajustar
      </button>
    </div>
  );
}

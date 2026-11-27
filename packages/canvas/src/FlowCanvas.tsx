import type { FlowContent } from '@trama/core';
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
  type NodeChangeset,
} from '@xyflow/react';
import { useCallback, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { fromReactFlow, toReactFlow, type CanvasEdge, type CanvasNode } from './convert';
import { nodeTypes } from './node-types';

export type CanvasTool = 'select' | 'pan';

export interface FlowCanvasProps {
  flow: FlowContent;
  /** Chamado ao soltar um bloco ou moldura, já com as posições na grade de 8 px. */
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

/** O quadro do Trama (tela 1): tela cheia, ferramentas flutuando, grade de 8 px. */
export function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}

function Canvas({ flow, onFlowChange, topLeft, topRight }: FlowCanvasProps) {
  const initial = useMemo(() => toReactFlow(flow), [flow]);
  const [nodes, setNodes] = useState<CanvasNode[]>(initial.nodes);
  const [edges] = useState<CanvasEdge[]>(initial.edges);
  const [tool, setTool] = useState<CanvasTool>('select');

  const onNodesChange = useCallback((changes: NodeChangeset<CanvasNode>) => {
    setNodes((current) => changes.applyTo(current));
  }, []);

  const onNodeDragStop = useCallback(() => {
    if (!onFlowChange) return;
    setNodes((current) => {
      onFlowChange(fromReactFlow(flow, current));
      return current;
    });
  }, [flow, onFlowChange]);

  const panning = tool === 'pan';

  return (
    <div className="relative size-full bg-canvas" data-testid="quadro">
      <ReactFlow<CanvasNode, CanvasEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
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
  );
}

type ToolButton = {
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>;
  tool?: CanvasTool;
};

const TOOLS: ToolButton[] = [
  { label: 'Selecionar', icon: SelectIcon, tool: 'select' },
  { label: 'Mover quadro', icon: PanIcon, tool: 'pan' },
  { label: 'Texto', icon: TextIcon },
  { label: 'Nota adesiva', icon: StickyIcon },
  { label: 'Forma', icon: ShapeIcon },
  { label: 'Seta', icon: ArrowIcon },
  { label: 'Imagem', icon: ImageIcon },
  { label: 'Vídeo ou link', icon: VideoIcon },
  { label: 'Moldura', icon: FrameIcon },
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
  return (
    <button
      type="button"
      aria-label={item.label}
      title={available ? item.label : `${item.label} (em breve)`}
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

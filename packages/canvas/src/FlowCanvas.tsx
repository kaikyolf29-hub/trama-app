import {
  presentationStepNumber,
  type Arrow,
  type Block,
  type FlowContent,
  type Frame,
} from '@trama/core';
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
  ViewportPortal,
  type Connection,
  type EdgeChangeset,
  type NodeChangeset,
  type PositionChange,
} from '@xyflow/react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { canConnect, sideOf } from './arrows';
import { CanvasContext, type CanvasActions } from './canvas-context';
import {
  arrowToEdge,
  blockToNode,
  FRAME_LAYER,
  frameToNode,
  fromReactFlow,
  toReactFlow,
  type CanvasEdge,
  type CanvasNode,
} from './convert';
import {
  createArrow,
  createBlock,
  createFrame,
  createImageBlock,
  createLinkBlock,
  normalizeLink,
  type CreatableKind,
} from './create';
import { readImageSize } from './image-size';
import {
  IMAGE_TYPES,
  isAcceptedImage,
  localMedia,
  MAX_IMAGE_BYTES,
  type CanvasMedia,
} from './media';
import { ContextMenu, type MenuItem } from './context-menu';
import { duplicateNodes, groupIntoFrame, History } from './edit';
import { edgeTypes, nodeTypes } from './node-types';
import { alignmentGuides, type Guides, type Rect } from './guides';
import { removeNodes } from './remove';
import { setNodeStep, type StepTarget } from './steps';

/** Selecionar, mover o quadro, ligar com setas, ou criar um tipo de bloco no próximo clique. */
export type CanvasTool = 'select' | 'pan' | 'arrow' | CreatableKind;
type ToolAction = 'image' | 'link';
type ScreenPoint = { x: number; y: number };
/** Clique direito: onde abriu e, num nó, o que valia nele naquela hora. */
type MenuState = ScreenPoint & { node?: { id: string; locked: boolean; step?: number } };

export interface FlowCanvasProps {
  /** Conteúdo inicial. Depois disso o quadro guarda o estado e avisa cada mudança. */
  flow: FlowContent;
  /** Chamado a cada mudança (mover, criar, editar, apagar), já na grade de 8 px. */
  onFlowChange?: (flow: FlowContent) => void;
  /** Onde guardar e de onde ler as imagens. Sem ele, ficam só nesta aba. */
  media?: CanvasMedia;
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
const CONNECTION_LINE_STYLE = { stroke: colors.selection, strokeWidth: 1.5 };
const MULTI_SELECT_KEYS = ['Shift', 'Meta', 'Control'];
const DELETE_KEYS = ['Backspace', 'Delete'];
/** Distância (px na tela) em que o bloco arrastado encaixa numa guia. */
const GUIDE_THRESHOLD = 6;
const NO_GUIDES: Guides = { vertical: [], horizontal: [] };
/** As linhas das guias atravessam o quadro todo. */
const GUIDE_REACH = 100_000;

/** Teclas que escolhem a ferramenta (docs/PLAN.md, "Blocos" e "Interações"). */
const SHORTCUTS: Partial<Record<string, CanvasTool>> = {
  v: 'select',
  h: 'pan',
  t: 'text',
  c: 'card',
  n: 'sticky',
  r: 'shape',
  s: 'arrow',
  e: 'checklist',
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

function Canvas({ flow, onFlowChange, media = localMedia, topLeft, topRight }: FlowCanvasProps) {
  const initial = useMemo(() => toReactFlow(flow), [flow]);
  const [nodes, setNodes] = useState<CanvasNode[]>(initial.nodes);
  const [edges, setEdges] = useState<CanvasEdge[]>(initial.edges);
  const [tool, setTool] = useState<CanvasTool>('select');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Os passos da aula ficam também em estado: a barra de contexto mostra "Aula: passo N".
  const [presentation, setPresentation] = useState(flow.presentation);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const reactFlow = useReactFlow<CanvasNode, CanvasEdge>();
  // O conteúdo do fluxo fica numa ref: os eventos leem e gravam sem esperar uma renderização.
  const content = useRef(flow);
  const history = useRef(new History());
  const wrapper = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // Onde o ponteiro está sobre o quadro: colar põe o bloco ali.
  const pointer = useRef<ScreenPoint | null>(null);
  // Onde o botão direito desceu: arrastar com ele move o quadro, clicar abre o menu.
  const rightDown = useRef<ScreenPoint | null>(null);

  /** Guarda o novo conteúdo, com as posições atuais dos nós, e avisa quem usa o quadro. */
  const commit = useCallback(
    (next: FlowContent, nodesNow: CanvasNode[] = reactFlow.getNodes()) => {
      const before = content.current;
      const after = fromReactFlow(next, nodesNow);
      // Soltar um bloco no mesmo lugar não é mudança: nem avisa, nem entra no histórico.
      if (JSON.stringify(after) === JSON.stringify(before)) return;
      history.current.record(before);
      content.current = after;
      setPresentation(after.presentation);
      onFlowChange?.(after);
    },
    [onFlowChange, reactFlow],
  );

  /** Troca o quadro inteiro por um fluxo (desfazer, refazer, duplicar, agrupar). */
  const show = useCallback(
    (next: FlowContent, selected: readonly string[] = []) => {
      const chosen = new Set(selected);
      const rebuilt = toReactFlow(next);
      setNodes(rebuilt.nodes.map((node) => ({ ...node, selected: chosen.has(node.id) })));
      setEdges(rebuilt.edges);
      setEditingId(null);
      content.current = next;
      setPresentation(next.presentation);
      onFlowChange?.(next);
    },
    [onFlowChange],
  );

  const undo = useCallback(() => {
    const previous = history.current.undo(content.current);
    if (previous) show(previous);
  }, [show]);

  const redo = useCallback(() => {
    const next = history.current.redo(content.current);
    if (next) show(next);
  }, [show]);

  /** O fluxo com as posições de agora e os ids selecionados. */
  const current = useCallback(() => {
    const nodesNow = reactFlow.getNodes();
    return {
      flow: fromReactFlow(content.current, nodesNow),
      selected: nodesNow.filter((node) => node.selected).map((node) => node.id),
    };
  }, [reactFlow]);

  /** Duplica os ids pedidos (clique direito) ou, sem eles, a seleção (Ctrl+D). */
  const duplicate = useCallback(
    (ids?: string[]) => {
      const { flow: base, selected: chosen } = current();
      const selected = ids ?? chosen;
      const { flow: next, copies } = duplicateNodes(base, selected);
      if (copies.length === 0) return;
      history.current.record(content.current);
      show(next, copies);
    },
    [current, show],
  );

  const group = useCallback(() => {
    const { flow: base, selected } = current();
    const result = groupIntoFrame(base, selected);
    if (!result) return;
    history.current.record(content.current);
    show(result.flow, [result.frameId]);
    setEditingId(result.frameId);
  }, [current, show]);

  const updateBlock = useCallback(
    (next: Block) => {
      setNodes((current) =>
        current.map((node) =>
          node.id === next.id && node.type === 'block'
            ? {
                ...node,
                width: next.size.width,
                height: next.size.height,
                zIndex: next.zIndex,
                draggable: !next.locked,
                deletable: !next.locked,
                data: { kind: 'block', block: next },
              }
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
            ? {
                ...node,
                zIndex: FRAME_LAYER + next.zIndex,
                draggable: !next.locked,
                deletable: !next.locked,
                data: { kind: 'frame', frame: next },
              }
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

  const updateArrow = useCallback(
    (next: Arrow) => {
      setEdges((current) =>
        current.map((edge) =>
          edge.id === next.id ? { ...arrowToEdge(next), selected: edge.selected } : edge,
        ),
      );
      const base = content.current;
      commit({
        ...base,
        arrows: base.arrows.map((arrow) => (arrow.id === next.id ? next : arrow)),
      });
    },
    [commit],
  );

  const setStep = useCallback(
    (id: string, target: StepTarget) => {
      const base = content.current;
      commit({ ...base, presentation: setNodeStep(base.presentation, id, target) });
    },
    [commit],
  );

  const removeNode = useCallback(
    (id: string) => void reactFlow.deleteElements({ nodes: [{ id }] }),
    [reactFlow],
  );

  /** Trava ou destrava: travado, o nó não se move, não apaga e não edita. */
  const toggleLock = useCallback(
    (id: string) => {
      const base = content.current;
      const block = base.blocks.find((b) => b.id === id);
      if (block) return updateBlock({ ...block, locked: !block.locked });
      const frame = base.frames.find((f) => f.id === id);
      if (frame) updateFrame({ ...frame, locked: !frame.locked });
    },
    [updateBlock, updateFrame],
  );

  /** Traz para frente: acima dos outros blocos (ou das outras molduras). */
  const bringToFront = useCallback(
    (id: string) => {
      const base = content.current;
      const block = base.blocks.find((b) => b.id === id);
      if (block) {
        const top = Math.max(...base.blocks.map((b) => b.zIndex));
        if (block.zIndex < top || base.blocks.filter((b) => b.zIndex === top).length > 1) {
          updateBlock({ ...block, zIndex: top + 1 });
        }
        return;
      }
      const frame = base.frames.find((f) => f.id === id);
      if (frame)
        updateFrame({ ...frame, zIndex: Math.max(...base.frames.map((f) => f.zIndex)) + 1 });
    },
    [updateBlock, updateFrame],
  );

  const isValidConnection = useCallback(
    (connection: Connection | CanvasEdge) =>
      canConnect(content.current.arrows, connection.source, connection.target),
    [],
  );

  // Puxar o ponto azul até outro bloco cria a seta (docs/PLAN.md, "Interações").
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!isValidConnection(connection)) return;
      const arrow = createArrow(
        { nodeId: connection.source, ...sideOf(connection.sourceHandle) },
        { nodeId: connection.target, ...sideOf(connection.targetHandle) },
      );
      setEdges((current) => [
        ...current.map((edge) => (edge.selected ? { ...edge, selected: false } : edge)),
        { ...arrowToEdge(arrow), selected: true },
      ]);
      const base = content.current;
      commit({ ...base, arrows: [...base.arrows, arrow] });
      setTool((current) => (current === 'arrow' ? 'select' : current));
    },
    [commit, isValidConnection],
  );

  /** Põe um bloco novo no quadro, selecionado (e em edição, se pedir). */
  const addBlock = useCallback(
    (block: Block, edit: boolean) => {
      setNodes((current) => [
        ...current.map((node) => (node.selected ? { ...node, selected: false } : node)),
        { ...blockToNode(block), selected: true },
      ]);
      const base = content.current;
      commit({ ...base, blocks: [...base.blocks, block] });
      if (edit) setEditingId(block.id);
    },
    [commit],
  );

  /** Cria um bloco (ou moldura) onde a pessoa clicou, já selecionado e em edição. */
  const create = useCallback(
    (kind: CreatableKind, screen: ScreenPoint) => {
      const at = reactFlow.screenToFlowPosition(screen);
      if (kind === 'frame') {
        const frame = createFrame(at);
        // Molduras vão no começo da lista: o React Flow pede pais antes dos filhos.
        setNodes((current) => [
          { ...frameToNode(frame), selected: true },
          ...current.map((node) => (node.selected ? { ...node, selected: false } : node)),
        ]);
        const base = content.current;
        commit({ ...base, frames: [...base.frames, frame] });
        setEditingId(frame.id);
      } else {
        addBlock(createBlock(kind, at), true);
      }
      setTool('select');
    },
    [addBlock, commit, reactFlow],
  );

  /** O meio do quadro na tela: onde entra o que vem pelos botões. */
  const center = useCallback((): ScreenPoint => {
    const rect = wrapper.current?.getBoundingClientRect();
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: 0, y: 0 };
  }, []);

  /** Ponto da tela para o quadro; sem coordenadas válidas no evento, usa o meio. */
  const toFlow = useCallback(
    (screen: ScreenPoint) =>
      reactFlow.screenToFlowPosition(
        Number.isFinite(screen.x) && Number.isFinite(screen.y) ? screen : center(),
      ),
    [center, reactFlow],
  );

  const addLink = useCallback(
    (url: string, screen: ScreenPoint) => {
      addBlock(createLinkBlock(toFlow(screen), url), false);
    },
    [addBlock, toFlow],
  );

  /** Sobe as imagens (arrastadas, coladas ou escolhidas) e cria um bloco para cada uma. */
  const addImages = useCallback(
    async (files: File[], screen: ScreenPoint) => {
      const images = files.filter(isAcceptedImage);
      if (images.length === 0) {
        setNotice('Use uma imagem PNG, JPG, WebP ou GIF.');
        return;
      }
      const at = toFlow(screen);
      for (const [index, file] of images.entries()) {
        if (file.size > MAX_IMAGE_BYTES) {
          setNotice(`${file.name} passa de 10 MB.`);
          continue;
        }
        setNotice('Enviando imagem…');
        try {
          const [src, naturalSize] = await Promise.all([
            media.uploadImage(file),
            readImageSize(file),
          ]);
          // Várias imagens de uma vez ficam em escada, para nenhuma cobrir a outra.
          const offset = index * GRID * 3;
          const block = createImageBlock(
            { x: at.x + offset, y: at.y + offset },
            { src, fileName: file.name, ...(naturalSize ? { naturalSize } : {}) },
          );
          addBlock(block, false);
          setNotice(null);
        } catch {
          setNotice('Não deu para enviar a imagem. Tente de novo.');
        }
      }
    },
    [addBlock, media, toFlow],
  );

  // Guias de alinhamento: só ao arrastar um nó sozinho (docs/PLAN.md, "Interações").
  const dragging = useRef<string | null>(null);
  const [guides, setGuides] = useState<Guides>(NO_GUIDES);

  /** Retângulo de um nó em coordenadas absolutas do quadro. */
  const rectOf = useCallback(
    (node: CanvasNode): Rect | null => {
      const internal = reactFlow.getInternalNode(node.id);
      if (!internal) return null;
      const { x, y } = internal.internals.positionAbsolute;
      return {
        x,
        y,
        width: internal.measured.width ?? node.width ?? 0,
        height: internal.measured.height ?? node.height ?? 0,
      };
    },
    [reactFlow],
  );

  /** Encaixa o nó arrastado nas bordas e no meio dos vizinhos e mostra as linhas. */
  const snapToGuides = useCallback(
    (changes: NodeChangeset<CanvasNode>) => {
      const id = dragging.current;
      if (!id) return;
      const change = changes
        .getForNode(id)
        .find((item): item is PositionChange => item.type === 'position' && item.dragging === true);
      const node = reactFlow.getNode(id);
      if (!change?.position || !node) return;
      const parent = node.parentId ? reactFlow.getInternalNode(node.parentId) : undefined;
      const origin = parent?.internals.positionAbsolute ?? { x: 0, y: 0 };
      const size = rectOf(node);
      if (!size) return;
      const moving = {
        ...size,
        x: origin.x + change.position.x,
        y: origin.y + change.position.y,
      };
      const others = reactFlow
        .getNodes()
        .filter((other) => other.id !== id && other.parentId !== id)
        .map(rectOf)
        .filter((rect): rect is Rect => rect !== null);
      const found = alignmentGuides(moving, others, GUIDE_THRESHOLD / reactFlow.getZoom());
      if (found.x !== undefined || found.y !== undefined) {
        changes.remove(change);
        changes.add({
          ...change,
          position: { x: (found.x ?? moving.x) - origin.x, y: (found.y ?? moving.y) - origin.y },
        });
      }
      setGuides(found);
    },
    [reactFlow, rectOf],
  );

  const onNodesChange = useCallback(
    (changes: NodeChangeset<CanvasNode>) => {
      snapToGuides(changes);
      setNodes((current) => changes.applyTo(current));
    },
    [snapToGuides],
  );

  const onEdgesChange = useCallback((changes: EdgeChangeset<CanvasEdge>) => {
    setEdges((current) => changes.applyTo(current));
  }, []);

  const onNodeDragStop = useCallback(() => {
    dragging.current = null;
    setGuides(NO_GUIDES);
    commit(content.current);
  }, [commit]);

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
      setLinkOpen(false);
      if (tool !== 'select' && tool !== 'pan' && tool !== 'arrow') {
        create(tool, { x: event.clientX, y: event.clientY });
      }
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

  // Arrastar arquivos de imagem ou um link para o quadro cria o bloco no ponto em que soltou.
  const onDragOver = useCallback((event: DragEvent) => {
    const types = event.dataTransfer.types;
    if (types.includes('Files') || types.includes('text/uri-list')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      const point = { x: event.clientX, y: event.clientY };
      const files = Array.from(event.dataTransfer.files);
      if (files.length > 0) {
        event.preventDefault();
        void addImages(files, point);
        return;
      }
      const first = event.dataTransfer.getData('text/uri-list').split('\n')[0] ?? '';
      const url = normalizeLink(first);
      if (url) {
        event.preventDefault();
        addLink(url, point);
      }
    },
    [addImages, addLink],
  );

  // Colar uma imagem ou um link (fora de um campo de texto) cria o bloco certo.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (isTyping(event.target) || !event.clipboardData) return;
      const point = pointer.current ?? center();
      const files = Array.from(event.clipboardData.files);
      if (files.length > 0) {
        event.preventDefault();
        void addImages(files, point);
        return;
      }
      const text = event.clipboardData.getData('text/plain').trim();
      const url = /^https?:\/\/\S+$/i.test(text) ? normalizeLink(text) : null;
      if (url) {
        event.preventDefault();
        addLink(url, point);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addImages, addLink, center]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      // Ctrl no Windows e no Linux, Cmd no Mac (docs/PLAN.md, "Interações").
      if (event.ctrlKey || event.metaKey) {
        const key = event.key.toLowerCase();
        const actions: Partial<Record<string, () => void>> = {
          z: event.shiftKey ? redo : undo,
          y: redo,
          d: () => duplicate(),
          g: group,
        };
        const action = actions[key];
        if (action && !event.altKey) {
          event.preventDefault();
          action();
        }
        return;
      }
      if (event.altKey) return;
      if (event.key === 'Escape') {
        setTool('select');
        setLinkOpen(false);
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
  }, [undo, redo, duplicate, group]);

  // O aviso some sozinho depois de alguns segundos.
  useEffect(() => {
    if (!notice || notice === 'Enviando imagem…') return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const onAction = useCallback((action: ToolAction) => {
    if (action === 'image') fileInput.current?.click();
    else setLinkOpen((open) => !open);
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  const menuHandlers = useMemo<MenuHandlers>(
    () => ({ create, duplicate, bringToFront, toggleLock, setStep, removeNode }),
    [create, duplicate, bringToFront, toggleLock, setStep, removeNode],
  );

  const actions = useMemo<CanvasActions>(
    () => ({
      editingId,
      startEditing: setEditingId,
      stopEditing: () => setEditingId(null),
      updateBlock,
      updateFrame,
      updateArrow,
      stepOf: (id: string) => presentationStepNumber(presentation, id),
      stepCount: presentation.length,
      setStep,
      removeNode,
      resolveImage: media.resolveImage,
    }),
    [editingId, updateBlock, updateFrame, updateArrow, presentation, setStep, removeNode, media],
  );

  const panning = tool === 'pan';
  const creating = tool !== 'select' && !panning && tool !== 'arrow';

  return (
    <CanvasContext.Provider value={actions}>
      <div
        ref={wrapper}
        className="trama-canvas relative size-full bg-canvas"
        data-testid="quadro"
        data-creating={creating || undefined}
        data-connecting={tool === 'arrow' || undefined}
        onDoubleClick={onDoubleClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onPointerMove={(event) => {
          pointer.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerDown={(event) => {
          if (event.button === 2) rightDown.current = { x: event.clientX, y: event.clientY };
        }}
        onContextMenu={(event) => {
          // O React Flow não chama onPaneContextMenu quando o botão direito também move o
          // quadro; por isso o menu do vazio é aberto aqui, se o ponteiro quase não andou.
          if (!(event.target instanceof Element)) return;
          if (!event.target.classList.contains('react-flow__pane')) return;
          event.preventDefault();
          const down = rightDown.current;
          rightDown.current = null;
          if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 4) return;
          setMenu({ x: event.clientX, y: event.clientY });
        }}
        onPointerLeave={() => {
          pointer.current = null;
        }}
      >
        <input
          ref={fileInput}
          type="file"
          accept={IMAGE_TYPES.join(',')}
          multiple
          hidden
          aria-label="Escolher imagem"
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = '';
            if (files.length > 0) void addImages(files, center());
          }}
        />
        <ReactFlow<CanvasNode, CanvasEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStart={(_, node, dragged) => {
            dragging.current = dragged.length === 1 ? node.id : null;
          }}
          onNodeDragStop={onNodeDragStop}
          onDelete={onDelete}
          onPaneClick={onPaneClick}
          onConnect={onConnect}
          onNodeContextMenu={(event, node) => {
            event.preventDefault();
            const base = content.current;
            const found =
              base.blocks.find((b) => b.id === node.id) ??
              base.frames.find((f) => f.id === node.id);
            setMenu({
              x: event.clientX,
              y: event.clientY,
              node: {
                id: node.id,
                locked: found?.locked ?? false,
                step: presentationStepNumber(base.presentation, node.id),
              },
            });
          }}
          isValidConnection={isValidConnection}
          onEdgeDoubleClick={(_, edge) => setEditingId(edge.id)}
          connectionLineStyle={CONNECTION_LINE_STYLE}
          nodesDraggable={tool !== 'arrow'}
          multiSelectionKeyCode={MULTI_SELECT_KEYS}
          selectionKeyCode={null}
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
            type: 'arrow',
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
          <GuideLines guides={guides} />
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
            <div className="relative">
              <Tools tool={tool} onToolChange={setTool} onAction={onAction} linkOpen={linkOpen} />
              {linkOpen && (
                <LinkPrompt
                  onClose={() => setLinkOpen(false)}
                  onSubmit={(url) => {
                    addLink(url, center());
                    setLinkOpen(false);
                  }}
                />
              )}
            </div>
          </Panel>
          {notice && (
            <Panel position="bottom-center" className={PANEL}>
              <p role="status" className={cn('px-4 py-2 text-sm text-text-strong', floatingPanel)}>
                {notice}
              </p>
            </Panel>
          )}
          {menu && <BoardMenu menu={menu} handlers={menuHandlers} onClose={closeMenu} />}
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

/** Caixa para colar o link do vídeo ou do site, ao lado da barra de ferramentas. */
function LinkPrompt({
  onSubmit,
  onClose,
}: {
  onSubmit: (url: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);
  return (
    <form
      // A validação é a nossa (aceita "vimeo.com/123" sem https); a do navegador recusaria.
      noValidate
      className={cn('absolute top-1/2 left-16 flex w-80 flex-col gap-2 p-3', floatingPanel)}
      style={{ transform: 'translateY(-50%)' }}
      onSubmit={(event) => {
        event.preventDefault();
        const url = normalizeLink(value);
        if (url) onSubmit(url);
        else setInvalid(true);
      }}
    >
      <label htmlFor="trama-link" className="text-xs font-medium text-text-muted">
        Vídeo do YouTube ou do Vimeo, ou o link de um site
      </label>
      <input
        id="trama-link"
        autoFocus
        type="url"
        inputMode="url"
        value={value}
        placeholder="https://"
        aria-invalid={invalid}
        aria-describedby={invalid ? 'trama-link-erro' : undefined}
        onChange={(event) => {
          setValue(event.target.value);
          setInvalid(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          }
        }}
        className="h-9 rounded-control border border-border bg-surface px-3 text-sm text-text-strong outline-none placeholder:text-text-muted focus:border-selection"
      />
      {invalid && (
        <p id="trama-link-erro" className="text-xs text-text">
          Esse link não parece certo. Confira e tente de novo.
        </p>
      )}
    </form>
  );
}

/** O que o clique direito pode fazer. */
type MenuHandlers = {
  create: (kind: CreatableKind, at: ScreenPoint) => void;
  duplicate: (ids: string[]) => void;
  bringToFront: (id: string) => void;
  toggleLock: (id: string) => void;
  setStep: (id: string, target: StepTarget) => void;
  removeNode: (id: string) => void;
};

/** O menu do clique direito, com os itens para o que foi clicado. */
function BoardMenu({
  menu,
  handlers,
  onClose,
}: {
  menu: MenuState;
  handlers: MenuHandlers;
  onClose: () => void;
}) {
  return (
    <ContextMenu
      x={menu.x}
      y={menu.y}
      label={menu.node ? 'Opções do bloco' : 'Adicionar ao quadro'}
      items={buildMenuItems(menu, handlers)}
      onClose={onClose}
    />
  );
}

/** Itens do clique direito: num nó, o que fazer com ele; no vazio, o menu de blocos. */
function buildMenuItems({ x, y, node }: MenuState, actions: MenuHandlers): MenuItem[] {
  const { create, duplicate, bringToFront, toggleLock, setStep, removeNode } = actions;
  if (!node) {
    const at = { x, y };
    const add = (label: string, kind: CreatableKind, shortcut: string): MenuItem => ({
      label,
      shortcut,
      onSelect: () => create(kind, at),
    });
    return [
      add('Texto', 'text', 'T'),
      add('Cartão', 'card', 'C'),
      add('Nota adesiva', 'sticky', 'N'),
      add('Forma', 'shape', 'R'),
      add('Etapas', 'checklist', 'E'),
      add('Moldura', 'frame', 'F'),
    ];
  }
  const { id, locked, step } = node;
  const items: MenuItem[] = [
    { label: 'Duplicar', shortcut: 'Ctrl+D', onSelect: () => duplicate([id]) },
    { label: 'Trazer para frente', onSelect: () => bringToFront(id) },
    { label: locked ? 'Destravar' : 'Travar', onSelect: () => toggleLock(id) },
    step
      ? {
          label: `Tirar da aula (passo ${step})`,
          separated: true,
          onSelect: () => setStep(id, null),
        }
      : {
          label: 'Pôr num passo novo da aula',
          separated: true,
          onSelect: () => setStep(id, 'new'),
        },
  ];
  if (!locked) {
    items.push({
      label: 'Apagar',
      shortcut: 'Delete',
      separated: true,
      onSelect: () => removeNode(id),
    });
  }
  return items;
}

/** As linhas azuis das guias, desenhadas no próprio quadro (acompanham zoom e movimento). */
function GuideLines({ guides }: { guides: Guides }) {
  if (guides.vertical.length === 0 && guides.horizontal.length === 0) return null;
  return (
    <ViewportPortal>
      <svg
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 overflow-visible"
        width={1}
        height={1}
      >
        {guides.vertical.map((x) => (
          <line
            key={`v${x}`}
            x1={x}
            x2={x}
            y1={-GUIDE_REACH}
            y2={GUIDE_REACH}
            stroke={colors.selection}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {guides.horizontal.map((y) => (
          <line
            key={`h${y}`}
            x1={-GUIDE_REACH}
            x2={GUIDE_REACH}
            y1={y}
            y2={y}
            stroke={colors.selection}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    </ViewportPortal>
  );
}

type ToolButton = {
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>;
  tool?: CanvasTool;
  /** Botão que faz algo na hora (abrir arquivo, colar link) em vez de escolher ferramenta. */
  action?: ToolAction;
  /** Tecla de atalho, mostrada na dica. */
  shortcut?: string;
};

// Na ordem da tela 1. Cartão e etapas não têm botão na barra: entram pelas teclas C e E.
const TOOLS: ToolButton[] = [
  { label: 'Selecionar', icon: SelectIcon, tool: 'select', shortcut: 'V' },
  { label: 'Mover quadro', icon: PanIcon, tool: 'pan', shortcut: 'H' },
  { label: 'Texto', icon: TextIcon, tool: 'text', shortcut: 'T' },
  { label: 'Nota adesiva', icon: StickyIcon, tool: 'sticky', shortcut: 'N' },
  { label: 'Forma', icon: ShapeIcon, tool: 'shape', shortcut: 'R' },
  { label: 'Seta', icon: ArrowIcon, tool: 'arrow', shortcut: 'S' },
  { label: 'Imagem', icon: ImageIcon, action: 'image' },
  { label: 'Vídeo ou link', icon: VideoIcon, action: 'link' },
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
      aria-pressed={item.tool || item.action === 'link' ? active : undefined}
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
  onAction,
  linkOpen,
}: {
  tool: CanvasTool;
  onToolChange: (tool: CanvasTool) => void;
  onAction: (action: ToolAction) => void;
  linkOpen: boolean;
}) {
  const handler = (item: ToolButton) => {
    const { tool: itemTool, action } = item;
    if (itemTool) return () => onToolChange(itemTool);
    if (action) return () => onAction(action);
    return undefined;
  };
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
          active={item.tool ? item.tool === tool : item.action === 'link' && linkOpen}
          onClick={handler(item)}
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

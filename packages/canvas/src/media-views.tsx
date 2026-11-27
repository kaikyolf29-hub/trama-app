import {
  checklistProgress,
  parseLinkEmbed,
  type AudioBlock,
  type ChecklistBlock,
  type ChecklistItem,
  type ImageBlock,
  type ImageCrop,
  type LinkBlock,
} from '@trama/core';
import { cn } from '@trama/ui';
import { FolderIcon, ImageIcon, LinkIcon, PlayIcon, PlusIcon, VoiceIcon } from '@trama/ui/icons';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
} from 'react';
import { useCanvas } from './canvas-context';
import { checklistHeight, newId } from './create';
import { EditableText } from './EditableText';
import { displayHost, formatDuration } from './format';
import { isDirectUrl } from './media';

type ViewProps<T> = { block: T; editing: boolean };

const blockBox =
  'flex size-full flex-col overflow-hidden rounded-block border border-border bg-surface shadow-block';

/** Resolve o endereço da imagem: direto, ou pelo `CanvasMedia` (pode demorar um pouco). */
function useImageUrl(src: string): string | null | undefined {
  const { resolveImage } = useCanvas();
  const direct = isDirectUrl(src) ? src : undefined;
  const [resolved, setResolved] = useState<{ src: string; url: string | null }>();
  useEffect(() => {
    if (direct) return;
    let alive = true;
    Promise.resolve(resolveImage(src)).then(
      (url) => alive && setResolved({ src, url }),
      () => alive && setResolved({ src, url: null }),
    );
    return () => {
      alive = false;
    };
  }, [src, direct, resolveImage]);
  if (direct) return direct;
  return resolved?.src === src ? resolved.url : undefined;
}

/** Recorte: a imagem cresce e anda para o pedaço escolhido ficar no quadro. */
function cropStyle(crop: ImageCrop): CSSProperties {
  return {
    position: 'absolute',
    width: `${100 / crop.width}%`,
    height: `${100 / crop.height}%`,
    left: `${(-crop.x / crop.width) * 100}%`,
    top: `${(-crop.y / crop.height) * 100}%`,
    maxWidth: 'none',
  };
}

/** Imagem (arrastar, colar ou botão): a figura em cima e o nome com o tamanho original embaixo. */
export function ImageBlockView({ block, editing }: ViewProps<ImageBlock>) {
  const { updateBlock, stopEditing } = useCanvas();
  const url = useImageUrl(block.src);
  const [failed, setFailed] = useState<string>();
  const broken = url === null || failed === url;
  const name = block.fileName ?? 'Imagem';
  return (
    <figure className={blockBox}>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-canvas">
        {url && !broken ? (
          <img
            src={url}
            alt={block.caption ?? name}
            draggable={false}
            onError={() => setFailed(url)}
            className={cn('size-full', block.crop ? '' : 'object-cover')}
            style={block.crop ? cropStyle(block.crop) : undefined}
          />
        ) : (
          <div
            className="flex size-full flex-col items-center justify-center gap-2 text-text-muted"
            role="img"
            aria-label={broken ? `${name}: imagem indisponível` : `${name}: carregando`}
          >
            <ImageIcon size={24} strokeWidth={1.5} aria-hidden />
            {broken && <span className="text-xs">Imagem indisponível</span>}
          </div>
        )}
      </div>
      <figcaption className="flex h-10 shrink-0 items-center gap-3 border-t border-border px-4 text-[13px]">
        <div className="min-w-0 flex-1 truncate text-text">
          <EditableText
            singleLine
            value={block.caption ?? ''}
            editing={editing}
            label="Legenda da imagem"
            placeholder={name}
            onCommit={(caption) => {
              const { caption: _old, ...rest } = block;
              updateBlock(caption.trim() ? { ...rest, caption: caption.trim() } : rest);
              stopEditing();
            }}
            className="text-[13px] text-text-strong"
          >
            <span className="truncate">{block.caption ?? name}</span>
          </EditableText>
        </div>
        {block.naturalSize && !editing && (
          <span className="shrink-0 text-xs text-text-muted tabular-nums">
            {block.naturalSize.width}×{block.naturalSize.height}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

function embedSrc(block: LinkBlock): string | null {
  const embed = parseLinkEmbed(block.url);
  if (embed.provider === 'youtube') {
    return `https://www.youtube-nocookie.com/embed/${embed.videoId}?autoplay=1&rel=0`;
  }
  if (embed.provider === 'vimeo') {
    const hash = embed.hash ? `&h=${embed.hash}` : '';
    return `https://player.vimeo.com/video/${embed.videoId}?autoplay=1${hash}`;
  }
  return null;
}

/** Faixa de baixo do vídeo e do link: título (edita no clique duplo) e o site. */
function LinkTitle({ block, editing }: ViewProps<LinkBlock>) {
  const { updateBlock, stopEditing } = useCanvas();
  const host = displayHost(block.url);
  return (
    <EditableText
      singleLine
      value={block.title ?? ''}
      editing={editing}
      label="Título do link"
      placeholder={host}
      onCommit={(title) => {
        const { title: _old, ...rest } = block;
        updateBlock(title.trim() ? { ...rest, title: title.trim() } : rest);
        stopEditing();
      }}
      className="text-[13px] font-medium text-text-strong"
    >
      <span className="block truncate">{block.title ?? host}</span>
    </EditableText>
  );
}

/** Vídeo ou link (colar o link). YouTube e Vimeo tocam no bloco; o resto vira cartão. */
export function LinkBlockView({ block, editing }: ViewProps<LinkBlock>) {
  const [playing, setPlaying] = useState(false);
  const player = embedSrc(block);
  const host = displayHost(block.url);

  if (!player) {
    const isFolder = /drive\.google\.com$/.test(host) && block.url.includes('/folders/');
    const Icon = isFolder ? FolderIcon : LinkIcon;
    return (
      <div className={cn(blockBox, 'flex-row items-center gap-3 px-4')}>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-hover text-text">
          <Icon size={18} strokeWidth={1.75} aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="text-[15px] text-text-strong">
            <LinkTitle block={block} editing={editing} />
          </div>
          <span className="truncate text-[13px] text-text-muted">
            Link ·{' '}
            <a
              href={block.url}
              target="_blank"
              rel="noopener noreferrer"
              className="nodrag rounded-tag hover:text-text hover:underline focus-visible:outline-2 focus-visible:outline-selection"
            >
              {host}
            </a>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={blockBox}>
      <div className="relative min-h-0 flex-1 bg-media">
        {playing ? (
          <iframe
            src={player}
            title={block.title ?? `Vídeo em ${host}`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="nodrag nowheel absolute inset-0 size-full border-0"
          />
        ) : (
          <>
            {block.thumbnailUrl && (
              <img
                src={block.thumbnailUrl}
                alt=""
                draggable={false}
                className="absolute inset-0 size-full object-cover opacity-80"
              />
            )}
            <button
              type="button"
              aria-label={`Tocar ${block.title ?? 'o vídeo'}`}
              onClick={() => setPlaying(true)}
              className="nodrag absolute top-1/2 left-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-text-strong text-canvas transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-selection"
            >
              <PlayIcon size={18} fill="currentColor" aria-hidden className="ml-0.5" />
            </button>
            {block.durationSeconds !== undefined && (
              <span className="absolute right-2.5 bottom-2.5 rounded-tag bg-media px-1.5 py-0.5 text-xs font-semibold text-text-strong tabular-nums">
                {formatDuration(block.durationSeconds)}
              </span>
            )}
          </>
        )}
      </div>
      <div className="flex h-10 shrink-0 items-center gap-3 border-t border-border px-4">
        <div className="min-w-0 flex-1">
          <LinkTitle block={block} editing={editing} />
        </div>
        <a
          href={block.url}
          target="_blank"
          rel="noopener noreferrer"
          className="nodrag shrink-0 rounded-tag text-[13px] text-text-muted hover:text-text hover:underline focus-visible:outline-2 focus-visible:outline-selection"
        >
          {host}
        </a>
      </div>
    </div>
  );
}

/** A bolinha de marcar das etapas: verde e cheia quando feita. */
function ItemDot({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'size-4 shrink-0 rounded-full transition-colors',
        done ? 'bg-done' : 'border-[1.5px] border-text-muted',
      )}
    />
  );
}

/** Etapas: lista com marcar e o contador (5/5). Clique duplo edita os nomes. */
export function ChecklistBlockView({ block, editing }: ViewProps<ChecklistBlock>) {
  const { updateBlock } = useCanvas();
  if (editing) return <ChecklistEditor block={block} />;

  const progress = checklistProgress(block.items);
  const toggle = (item: ChecklistItem) =>
    updateBlock({
      ...block,
      items: block.items.map((it) => (it.id === item.id ? { ...it, done: !it.done } : it)),
    });

  return (
    <div className={cn(blockBox, 'gap-3 p-4')}>
      <div className="flex h-5 items-center justify-between gap-2">
        <span className="truncate text-[11px] font-semibold tracking-[0.05em] text-text-muted uppercase">
          {block.title}
        </span>
        <span
          className={cn(
            'text-xs font-semibold tabular-nums',
            progress.complete ? 'text-done-text' : 'text-text-muted',
          )}
          aria-label={`${progress.done} de ${progress.total} etapas feitas`}
        >
          {progress.done}/{progress.total}
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {block.items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              role="checkbox"
              aria-checked={item.done}
              onClick={() => toggle(item)}
              className="nodrag flex h-6 w-full items-center gap-2.5 rounded-tag text-left text-sm focus-visible:outline-2 focus-visible:outline-selection"
            >
              <ItemDot done={item.done} />
              <span
                className={cn(
                  'min-w-0 truncate',
                  item.done ? 'text-text-muted line-through' : 'text-text-strong',
                  !item.text && 'text-text-muted',
                )}
              >
                {item.text || 'Etapa sem nome'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Edição das etapas: Enter cria a próxima, Backspace num nome vazio apaga, Esc ou sair do
 * bloco confirma. Enquanto edita, a caixa cresce com a lista; ao confirmar, o bloco fica
 * com a altura certa (na grade).
 */
function ChecklistEditor({ block }: { block: ChecklistBlock }) {
  const { updateBlock, stopEditing } = useCanvas();
  const [title, setTitle] = useState(block.title);
  const [items, setItems] = useState(block.items);
  const [focusId, setFocusId] = useState<string | undefined>(block.items.at(-1)?.id);
  const inputs = useRef(new Map<string, HTMLInputElement>());

  useEffect(() => {
    if (focusId) inputs.current.get(focusId)?.focus();
  }, [focusId, items.length]);

  const finish = () => {
    const kept = items.filter((item) => item.text.trim() !== '' || item.done);
    const next = kept.length > 0 ? kept : items.slice(0, 1);
    updateBlock({
      ...block,
      title: title.trim() || block.title,
      items: next,
      size: { ...block.size, height: checklistHeight(next.length) },
    });
    stopEditing();
  };

  const addAfter = (index: number) => {
    const created = { id: newId(), text: '', done: false };
    setItems([...items.slice(0, index + 1), created, ...items.slice(index + 1)]);
    setFocusId(created.id);
  };

  const onItemKey = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    const item = items[index];
    if (!item) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      addAfter(index);
    } else if (event.key === 'Backspace' && item.text === '' && items.length > 1) {
      event.preventDefault();
      setItems(items.filter((it) => it.id !== item.id));
      setFocusId(items[index - 1]?.id ?? items[index + 1]?.id);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      finish();
    }
  };

  return (
    <div
      className={cn(blockBox, 'nodrag nowheel h-auto min-h-full gap-3 p-4')}
      onBlur={(event: FocusEvent<HTMLDivElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget)) finish();
      }}
    >
      <input
        aria-label="Nome da lista"
        value={title}
        maxLength={80}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            finish();
          } else if (event.key === 'Enter') {
            event.preventDefault();
            setFocusId(items[0]?.id);
          }
        }}
        className="h-5 bg-transparent text-[11px] font-semibold tracking-[0.05em] text-text-strong uppercase outline-none"
      />
      <div className="flex flex-col gap-2">
        {items.map((item, index) => (
          <div key={item.id} className="flex h-6 items-center gap-2.5">
            <ItemDot done={item.done} />
            <input
              ref={(element) => {
                if (element) inputs.current.set(item.id, element);
                else inputs.current.delete(item.id);
              }}
              aria-label={`Etapa ${index + 1}`}
              value={item.text}
              maxLength={500}
              placeholder="Nome da etapa"
              onChange={(event) =>
                setItems(
                  items.map((it) => (it.id === item.id ? { ...it, text: event.target.value } : it)),
                )
              }
              onKeyDown={(event) => onItemKey(event, index)}
              className="min-w-0 flex-1 bg-transparent text-sm text-text-strong outline-none placeholder:text-text-muted"
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => addAfter(items.length - 1)}
        className="flex h-6 items-center gap-2.5 self-start rounded-tag text-sm text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-selection"
      >
        <PlusIcon size={16} aria-hidden />
        Adicionar etapa
      </button>
    </div>
  );
}

/** Áudio da ferramenta de voz (fase 3): duração e se já tem transcrição. */
export function AudioBlockView({ block }: { block: AudioBlock }) {
  return (
    <div className={cn(blockBox, 'flex-row items-center gap-3 px-4')}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-text-strong text-canvas">
        <VoiceIcon size={18} strokeWidth={1.75} aria-hidden />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[15px] font-medium text-text-strong">
          Áudio
          {block.durationSeconds !== undefined && ` · ${formatDuration(block.durationSeconds)}`}
        </span>
        <span className="truncate text-[13px] text-text-muted">
          {block.transcript ? 'Transcrito' : 'Sem transcrição'}
        </span>
      </div>
    </div>
  );
}

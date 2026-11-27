import {
  blockSchema,
  frameSchema,
  imageBlockSchema,
  linkBlockSchema,
  parseLinkEmbed,
  snapToGrid,
  type Block,
  type Frame,
  type ImageBlock,
  type LinkBlock,
  type Point,
  type Size,
} from '@trama/core';

/** O que as ferramentas e os atalhos (T, C, N, R, E, F) criam com um clique no quadro. */
export type CreatableKind = 'text' | 'card' | 'sticky' | 'shape' | 'checklist' | 'frame';

/** Tamanhos iniciais, na grade de 8 px (blocos do mesmo tipo, do mesmo tamanho). */
export const DEFAULT_SIZES: Record<CreatableKind, Size> = {
  text: { width: 320, height: 56 },
  card: { width: 280, height: 144 },
  sticky: { width: 160, height: 152 },
  shape: { width: 160, height: 96 },
  checklist: { width: 200, height: 104 },
  frame: { width: 480, height: 320 },
};

/** Vídeo do YouTube ou do Vimeo, e qualquer outro link (cartão com prévia). */
export const LINK_SIZES = {
  video: { width: 320, height: 216 },
  web: { width: 280, height: 88 },
} as const satisfies Record<string, Size>;

/** A imagem cabe nesta caixa; a faixa de baixo mostra o nome e o tamanho original. */
const IMAGE_BOX: Size = { width: 280, height: 360 };
const IMAGE_MIN_WIDTH = 160;
export const IMAGE_FOOTER = 40;

export function newId(): string {
  return crypto.randomUUID();
}

/** Arredonda para cima, na grade: um bloco nunca corta o que mostra. */
function snapUp(value: number): number {
  return Math.ceil(value / 8) * 8;
}

/** Altura das etapas: cabeçalho, uma linha por etapa e a margem de baixo. */
export function checklistHeight(items: number): number {
  return snapUp(56 + Math.max(items, 1) * 32 + 16);
}

/** Centraliza o bloco onde a pessoa clicou e encaixa o canto na grade. */
function placeAt(point: Point, size: Size): Point {
  return { x: snapToGrid(point.x - size.width / 2), y: snapToGrid(point.y - size.height / 2) };
}

/** Cria um bloco vazio, já validado pelo contrato do core. */
export function createBlock(kind: Exclude<CreatableKind, 'frame'>, at: Point, id = newId()): Block {
  const size = DEFAULT_SIZES[kind];
  return blockSchema.parse({
    id,
    type: kind,
    position: placeAt(at, size),
    size,
    ...(kind === 'checklist' ? { items: [{ id: newId() }] } : {}),
  });
}

export function createFrame(at: Point, id = newId()): Frame {
  return frameSchema.parse({
    id,
    title: 'Nova seção',
    position: placeAt(at, DEFAULT_SIZES.frame),
    size: DEFAULT_SIZES.frame,
  });
}

/** Tamanho do bloco de imagem: cabe na caixa, sem esticar imagem pequena. */
export function imageBlockSize(natural?: Size): Size {
  if (!natural) return { width: IMAGE_BOX.width, height: 200 };
  const scale = Math.min(IMAGE_BOX.width / natural.width, IMAGE_BOX.height / natural.height, 1);
  // Para baixo na grade: a imagem nunca passa da caixa.
  const width = Math.max(IMAGE_MIN_WIDTH, Math.floor((natural.width * scale) / 8) * 8);
  const imageHeight = Math.min(
    IMAGE_BOX.height,
    snapToGrid((width / natural.width) * natural.height),
  );
  return { width, height: Math.max(snapToGrid(48), imageHeight) + IMAGE_FOOTER };
}

export function createImageBlock(
  at: Point,
  image: { src: string; fileName?: string; naturalSize?: Size },
  id = newId(),
): ImageBlock {
  const size = imageBlockSize(image.naturalSize);
  return imageBlockSchema.parse({
    id,
    type: 'image',
    position: placeAt(at, size),
    size,
    src: image.src,
    ...(image.fileName ? { fileName: image.fileName.slice(0, 255) } : {}),
    ...(image.naturalSize ? { naturalSize: image.naturalSize } : {}),
  });
}

/** Link http(s) que o bloco "Vídeo ou link" aceita, ou null. */
export function normalizeLink(raw: string): string | null {
  const text = raw.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    // Um nome de site precisa de ponto (exemplo.com); "oi" sozinho não é link.
    if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function createLinkBlock(at: Point, url: string, id = newId()): LinkBlock {
  const embed = parseLinkEmbed(url);
  const size = embed.provider === 'web' ? LINK_SIZES.web : LINK_SIZES.video;
  return linkBlockSchema.parse({ id, type: 'link', position: placeAt(at, size), size, url });
}

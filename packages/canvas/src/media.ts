/**
 * Onde as imagens do quadro moram. O quadro não sabe do Supabase nem do Drive: quem usa o
 * quadro passa um `CanvasMedia`. Sem ele, as imagens ficam só nesta aba (bom para o exemplo).
 */
export interface CanvasMedia {
  /** Guarda o arquivo e devolve o `src` do bloco (ex.: o caminho no Storage). */
  uploadImage: (file: File) => Promise<string>;
  /** Endereço para mostrar a imagem, ou null se ela não estiver disponível. */
  resolveImage: (src: string) => string | null | Promise<string | null>;
}

/** Tipos de imagem aceitos: os que todo navegador mostra. */
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
/** 10 MB: uma thumbnail ou captura de tela cabe com folga. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function isAcceptedImage(file: File): boolean {
  return (IMAGE_TYPES as readonly string[]).includes(file.type);
}

/** Endereço que o navegador já sabe abrir, sem passar pelo app. */
export function isDirectUrl(src: string): boolean {
  return /^(?:blob:|data:image\/|https:\/\/)/.test(src);
}

/** Sem armazenamento: a imagem vale só enquanto a aba estiver aberta. */
export const localMedia: CanvasMedia = {
  uploadImage: (file) => Promise.resolve(URL.createObjectURL(file)),
  resolveImage: (src) => (isDirectUrl(src) ? src : null),
};

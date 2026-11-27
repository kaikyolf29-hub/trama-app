import { isDirectUrl, type CanvasMedia } from '@trama/canvas';
import type { Supabase } from '../supabase';

/** Bucket privado das imagens (supabase/migrations/*_arquivos.sql). */
export const FILES_BUCKET = 'arquivos';
/** O endereço assinado vale 1 hora; é renovado 5 minutos antes de vencer. */
const SIGNED_URL_SECONDS = 60 * 60;
const RENEW_BEFORE_MS = 5 * 60 * 1000;

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** O pedaço do Storage que o quadro usa (o `supabase.storage.from(...)` serve). */
export interface FileBucket {
  upload: (
    path: string,
    file: File,
    options: { contentType: string; cacheControl: string; upsert: boolean },
  ) => Promise<{ error: unknown }>;
  createSignedUrl: (
    path: string,
    expiresIn: number,
  ) => Promise<{ data: { signedUrl: string } | null; error: unknown }>;
}

export function filesBucket(supabase: Supabase): FileBucket {
  return supabase.storage.from(FILES_BUCKET);
}

/**
 * Imagens do quadro no Supabase Storage. Cada arquivo vai para `<id da pessoa>/<uuid>.<ext>`:
 * a RLS do bucket só deixa cada pessoa ler e gravar a própria pasta. O bloco guarda esse
 * caminho; para mostrar, o app pede um endereço assinado e temporário.
 */
export function createSupabaseMedia(
  bucket: FileBucket,
  userId: string,
  now: () => number = Date.now,
): CanvasMedia {
  const signed = new Map<string, { url: string; expiresAt: number }>();

  return {
    async uploadImage(file) {
      const extension = EXTENSIONS[file.type];
      if (!extension) throw new Error(`Tipo de imagem não aceito: ${file.type || 'desconhecido'}`);
      const path = `${userId}/${crypto.randomUUID()}.${extension}`;
      const { error } = await bucket.upload(path, file, {
        contentType: file.type,
        // O nome é único e o arquivo nunca muda: o navegador pode guardar por um ano.
        cacheControl: '31536000',
        upsert: false,
      });
      if (error) throw error instanceof Error ? error : new Error('Falha ao enviar a imagem.');
      return path;
    },

    async resolveImage(src) {
      if (isDirectUrl(src)) return src;
      const cached = signed.get(src);
      if (cached && cached.expiresAt - now() > RENEW_BEFORE_MS) return cached.url;
      const { data, error } = await bucket.createSignedUrl(src, SIGNED_URL_SECONDS);
      if (error || !data) return null;
      signed.set(src, { url: data.signedUrl, expiresAt: now() + SIGNED_URL_SECONDS * 1000 });
      return data.signedUrl;
    },
  };
}

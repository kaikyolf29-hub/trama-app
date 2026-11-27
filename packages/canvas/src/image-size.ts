import type { Size } from '@trama/core';

/** Lê a largura e a altura originais da imagem, sem subir nada. */
export async function readImageSize(file: Blob): Promise<Size | undefined> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size.width > 0 && size.height > 0 ? size : undefined;
  } catch {
    return undefined;
  }
}

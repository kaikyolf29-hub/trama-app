import { describe, expect, it, vi } from 'vitest';
import { createSupabaseMedia, type FileBucket } from './supabase-media';

const USER = '11111111-1111-4111-8111-111111111111';

function fakeBucket(overrides: Partial<FileBucket> = {}) {
  const upload = vi.fn<FileBucket['upload']>(() => Promise.resolve({ error: null }));
  const createSignedUrl = vi.fn<FileBucket['createSignedUrl']>((path) =>
    Promise.resolve({
      data: { signedUrl: `https://storage.exemplo/${path}?token=1` },
      error: null,
    }),
  );
  return { upload, createSignedUrl, ...overrides };
}

describe('imagens no Supabase Storage', () => {
  it('sobe na pasta da pessoa, com nome único e o tipo certo', async () => {
    const bucket = fakeBucket();
    const media = createSupabaseMedia(bucket, USER);
    const src = await media.uploadImage(new File(['x'], 'Thumb Final.PNG', { type: 'image/png' }));
    expect(src).toMatch(new RegExp(`^${USER}/[0-9a-f-]{36}\\.png$`));
    expect(bucket.upload).toHaveBeenCalledWith(src, expect.any(File), {
      contentType: 'image/png',
      cacheControl: '31536000',
      upsert: false,
    });
    const other = await media.uploadImage(new File(['y'], 'a.jpg', { type: 'image/jpeg' }));
    expect(other).not.toBe(src);
    expect(other.endsWith('.jpg')).toBe(true);
  });

  it('recusa tipo que não é imagem aceita, sem subir nada', async () => {
    const bucket = fakeBucket();
    const media = createSupabaseMedia(bucket, USER);
    await expect(
      media.uploadImage(new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' })),
    ).rejects.toThrow('Tipo de imagem não aceito');
    expect(bucket.upload).not.toHaveBeenCalled();
  });

  it('repassa o erro do envio', async () => {
    const media = createSupabaseMedia(
      fakeBucket({ upload: () => Promise.resolve({ error: new Error('cota cheia') }) }),
      USER,
    );
    await expect(
      media.uploadImage(new File(['x'], 'a.png', { type: 'image/png' })),
    ).rejects.toThrow('cota cheia');
  });

  it('mostra pela URL assinada e reaproveita até perto de vencer', async () => {
    let clock = 0;
    const bucket = fakeBucket();
    const media = createSupabaseMedia(bucket, USER, () => clock);
    const path = `${USER}/a.png`;
    expect(await media.resolveImage(path)).toBe(`https://storage.exemplo/${path}?token=1`);
    expect(bucket.createSignedUrl).toHaveBeenCalledWith(path, 3600);
    clock = 50 * 60 * 1000;
    await media.resolveImage(path);
    expect(bucket.createSignedUrl).toHaveBeenCalledTimes(1);
    clock = 56 * 60 * 1000;
    await media.resolveImage(path);
    expect(bucket.createSignedUrl).toHaveBeenCalledTimes(2);
  });

  it('endereço direto não passa pelo Storage; arquivo que falta vira null', async () => {
    const bucket = fakeBucket({
      createSignedUrl: () => Promise.resolve({ data: null, error: new Error('não achou') }),
    });
    const media = createSupabaseMedia(bucket, USER);
    expect(await media.resolveImage('blob:http://localhost/1')).toBe('blob:http://localhost/1');
    expect(await media.resolveImage(`${USER}/sumiu.png`)).toBeNull();
  });
});

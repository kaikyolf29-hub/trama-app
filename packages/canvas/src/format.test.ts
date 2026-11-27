import { describe, expect, it } from 'vitest';
import { displayHost, formatDay, formatDuration } from './format';
import { isAcceptedImage, isDirectUrl, localMedia } from './media';

describe('formatos', () => {
  it('mostra a duração como no vídeo da tela 1', () => {
    expect(formatDuration(768)).toBe('12:48');
    expect(formatDuration(92)).toBe('1:32');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(-4)).toBe('0:00');
  });

  it('mostra o dia do cartão sem "de" nem ponto', () => {
    expect(formatDay('2026-11-12T12:00:00Z')).toBe('12 nov 2026');
    expect(formatDay('não é data')).toBe('');
  });

  it('mostra só o nome do site', () => {
    expect(displayHost('https://www.youtube.com/watch?v=x')).toBe('youtube.com');
    expect(displayHost('https://drive.google.com/drive/folders/a')).toBe('drive.google.com');
  });
});

describe('imagens', () => {
  it('aceita PNG, JPG, WebP e GIF', () => {
    expect(isAcceptedImage(new File(['x'], 'a.png', { type: 'image/png' }))).toBe(true);
    expect(isAcceptedImage(new File(['x'], 'a.svg', { type: 'image/svg+xml' }))).toBe(false);
    expect(isAcceptedImage(new File(['x'], 'a.txt', { type: 'text/plain' }))).toBe(false);
  });

  it('sem armazenamento, mostra só endereços que o navegador abre sozinho', () => {
    expect(isDirectUrl('blob:http://localhost/1')).toBe(true);
    expect(isDirectUrl('https://exemplo.com/a.png')).toBe(true);
    expect(isDirectUrl('data:image/png;base64,AAA')).toBe(true);
    expect(isDirectUrl('data:text/html,oi')).toBe(false);
    expect(isDirectUrl('javascript:alert(1)')).toBe(false);
    expect(localMedia.resolveImage('projects/exemplo/thumbnail-final.png')).toBeNull();
  });
});

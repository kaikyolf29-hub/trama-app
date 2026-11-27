import { describe, expect, it } from 'vitest';
import { parseLinkEmbed } from './link';

describe('parseLinkEmbed', () => {
  it.each([
    'https://www.youtube.com/watch?v=abcDEF12345',
    'https://youtube.com/watch?v=abcDEF12345&t=42s',
    'https://m.youtube.com/watch?v=abcDEF12345',
    'https://youtu.be/abcDEF12345',
    'https://youtu.be/abcDEF12345?si=xyz',
    'https://www.youtube.com/shorts/abcDEF12345',
    'https://www.youtube.com/embed/abcDEF12345',
    'https://www.youtube.com/live/abcDEF12345',
    'https://www.youtube-nocookie.com/embed/abcDEF12345',
  ])('reconhece YouTube em %s', (url) => {
    expect(parseLinkEmbed(url)).toEqual({ provider: 'youtube', videoId: 'abcDEF12345' });
  });

  it.each([
    'https://vimeo.com/76979871',
    'https://www.vimeo.com/76979871/',
    'https://player.vimeo.com/video/76979871',
    'https://vimeo.com/channels/staffpicks/76979871',
    'https://vimeo.com/groups/motion/videos/76979871',
    'https://vimeo.com/showcase/1234567/video/76979871',
    'https://vimeo.com/album/1234567/video/76979871',
  ])('reconhece Vimeo em %s', (url) => {
    expect(parseLinkEmbed(url)).toEqual({ provider: 'vimeo', videoId: '76979871' });
  });

  it.each([
    'https://vimeo.com/76979871/a1b2c3d4e5',
    'https://player.vimeo.com/video/76979871?h=a1b2c3d4e5',
  ])('guarda o hash de vídeo não listado do Vimeo em %s', (url) => {
    expect(parseLinkEmbed(url)).toEqual({
      provider: 'vimeo',
      videoId: '76979871',
      hash: 'a1b2c3d4e5',
    });
  });

  it.each([
    'https://drive.google.com/drive/folders/abc',
    'https://www.youtube.com/@canal',
    'https://www.youtube.com/watch?v=curto',
    'https://vimeo.com/about',
    'https://vimeo.com/showcase/1234567',
    'https://vimeo.com/album/1234567',
    'https://vimeo.com/channels/staffpicks',
    'https://vimeo.com/user12345',
    'https://player.vimeo.com/video/76979871/extra',
    'https://youtube.com.golpe.example/watch?v=abcDEF12345',
    'ftp://youtube.com/watch?v=abcDEF12345',
    'não é um link',
  ])('trata como link comum: %s', (url) => {
    expect(parseLinkEmbed(url)).toEqual({ provider: 'web' });
  });
});

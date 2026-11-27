/**
 * Regra do bloco "Vídeo ou link": YouTube e Vimeo tocam dentro do bloco;
 * qualquer outro link vira cartão com prévia.
 */
export type LinkEmbed =
  | { provider: 'youtube'; videoId: string }
  | { provider: 'vimeo'; videoId: string }
  | { provider: 'web' };

export type LinkProvider = LinkEmbed['provider'];

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_PATH_PREFIXES = ['embed', 'shorts', 'live', 'v'];

const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);
const VIMEO_ID = /^\d+$/;

const WEB: LinkEmbed = { provider: 'web' };

/** Descobre se um link toca dentro do bloco (e qual vídeo) ou se vira cartão com prévia. */
export function parseLinkEmbed(rawUrl: string): LinkEmbed {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return WEB;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return WEB;

  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split('/').filter(Boolean);

  if (host === 'youtu.be') {
    const id = segments[0];
    return id && YOUTUBE_ID.test(id) ? { provider: 'youtube', videoId: id } : WEB;
  }

  if (YOUTUBE_HOSTS.has(host)) {
    const fromQuery = segments[0] === 'watch' ? url.searchParams.get('v') : null;
    const fromPath =
      segments[0] && YOUTUBE_PATH_PREFIXES.includes(segments[0]) ? segments[1] : undefined;
    const id = fromQuery ?? fromPath;
    return id && YOUTUBE_ID.test(id) ? { provider: 'youtube', videoId: id } : WEB;
  }

  if (VIMEO_HOSTS.has(host)) {
    // vimeo.com/123, vimeo.com/channels/nome/123, player.vimeo.com/video/123
    const id = segments.findLast((segment) => VIMEO_ID.test(segment));
    return id ? { provider: 'vimeo', videoId: id } : WEB;
  }

  return WEB;
}

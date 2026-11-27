/**
 * Regra do bloco "Vídeo ou link": YouTube e Vimeo tocam dentro do bloco;
 * qualquer outro link vira cartão com prévia.
 */
export type LinkEmbed =
  | { provider: 'youtube'; videoId: string }
  /** `hash` vem dos vídeos não listados do Vimeo; o player precisa dele para tocar. */
  | { provider: 'vimeo'; videoId: string; hash?: string }
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

const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com']);
const VIMEO_PLAYER_HOST = 'player.vimeo.com';
const VIMEO_HASH = /^[0-9a-f]+$/i;
/**
 * Só caminhos que apontam para UM vídeo. Coleções (showcase, album, canal, grupo)
 * sem o vídeo no fim viram link comum.
 */
const VIMEO_VIDEO_PATHS = [
  /^\/(\d+)(?:\/([0-9a-f]+))?\/?$/i, // vimeo.com/123 e vimeo.com/123/<hash>
  /^\/channels\/[^/]+\/(\d+)\/?$/, // vimeo.com/channels/nome/123
  /^\/groups\/[^/]+\/videos\/(\d+)\/?$/, // vimeo.com/groups/nome/videos/123
  /^\/(?:showcase|album)\/\d+\/video\/(\d+)\/?$/, // vimeo.com/showcase/1/video/123
];
const VIMEO_PLAYER_PATH = /^\/video\/(\d+)\/?$/; // player.vimeo.com/video/123?h=<hash>

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

  if (host === VIMEO_PLAYER_HOST) {
    const id = VIMEO_PLAYER_PATH.exec(url.pathname)?.[1];
    if (!id) return WEB;
    const hash = url.searchParams.get('h');
    return hash && VIMEO_HASH.test(hash)
      ? { provider: 'vimeo', videoId: id, hash }
      : { provider: 'vimeo', videoId: id };
  }

  if (VIMEO_HOSTS.has(host)) {
    for (const pattern of VIMEO_VIDEO_PATHS) {
      const match = pattern.exec(url.pathname);
      const id = match?.[1];
      if (!id) continue;
      const hash = match[2];
      return hash ? { provider: 'vimeo', videoId: id, hash } : { provider: 'vimeo', videoId: id };
    }
    return WEB;
  }

  return WEB;
}

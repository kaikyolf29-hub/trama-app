/**
 * O Google, o Resend e o Supabase Auth de mentira: um `fetch` falso que responde como as APIs
 * de verdade (o necessário para os testes) e anota cada chamada. Nenhum teste fala com a rede.
 */

export interface FakeFile {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  content: string;
  trashed: boolean;
}

export interface SentEmail {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
}

export const REFRESH_TOKEN = 'rt-segredo-da-ana';

export function createFakeGoogle() {
  const files = new Map<string, FakeFile>();
  const calls: { method: string; url: string }[] = [];
  const emails: SentEmail[] = [];
  const revoked: string[] = [];
  let counter = 0;
  const state = {
    /** Todas as chamadas à API do Drive respondem 500. */
    driveDown: false,
    /** O Google já não aceita o refresh token (acesso revogado). */
    revoked: false,
    /** O código de autorização devolvido sem refresh token. */
    omitRefreshToken: false,
    /** O Resend recusa o envio. */
    resendDown: false,
    email: 'ana@gmail.example',
  };

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  const publicFile = (file: FakeFile) => ({
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    trashed: file.trashed,
    size: String(new TextEncoder().encode(file.content).length),
  });

  const create = (init: Omit<FakeFile, 'id' | 'trashed'>): FakeFile => {
    const file = { ...init, id: `file${String(++counter).padStart(4, '0')}abcdef`, trashed: false };
    files.set(file.id, file);
    return file;
  };

  /** Partes de um corpo multipart/related (metadados em JSON e conteúdo). */
  function parseMultipart(contentType: string, body: string) {
    const boundary = /boundary=(.+)$/.exec(contentType)?.[1] ?? '';
    const parts = body
      .split(`--${boundary}`)
      .map((part) => part.replace(/^\r\n/, '').replace(/\r\n$/, ''))
      .filter((part) => part && part !== '--');
    const content = (part: string) => part.slice(part.indexOf('\r\n\r\n') + 4);
    return {
      metadata: JSON.parse(content(parts[0] ?? '{}')) as {
        name: string;
        parents: string[];
        mimeType: string;
      },
      content: content(parts[1] ?? ''),
    };
  }

  const fetcher: typeof fetch = async (input, init = {}) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const method = request.method;
    calls.push({ method, url: `${url.origin}${url.pathname}${url.search}` });
    const auth = request.headers.get('Authorization');

    if (url.origin === 'https://oauth2.googleapis.com' && url.pathname === '/token') {
      const form = new URLSearchParams(await request.text());
      if (form.get('client_id') !== 'client-id' || form.get('client_secret') !== 'client-secret') {
        return json({ error: 'invalid_client' }, 401);
      }
      if (form.get('grant_type') === 'authorization_code') {
        if (form.get('code') !== 'codigo-bom') return json({ error: 'invalid_grant' }, 400);
        return json({
          access_token: 'at-1',
          expires_in: 3599,
          scope: 'https://www.googleapis.com/auth/drive.file',
          ...(state.omitRefreshToken ? {} : { refresh_token: REFRESH_TOKEN }),
        });
      }
      if (form.get('refresh_token') !== REFRESH_TOKEN || state.revoked) {
        return json({ error: 'invalid_grant' }, 400);
      }
      return json({ access_token: 'at-2', expires_in: 3599 });
    }

    if (url.origin === 'https://oauth2.googleapis.com' && url.pathname === '/revoke') {
      revoked.push(new URLSearchParams(await request.text()).get('token') ?? '');
      return json({});
    }

    if (url.origin === 'https://api.resend.com' && url.pathname === '/emails') {
      if (auth !== 'Bearer re_chave') return json({ message: 'invalid key' }, 401);
      if (state.resendDown) return json({ message: 'boom' }, 500);
      emails.push((await request.json()) as SentEmail);
      return json({ id: 'email-1' });
    }

    if (url.hostname !== 'www.googleapis.com') return json({ error: 'desconhecido' }, 404);
    if (auth !== 'Bearer at-2' && auth !== 'Bearer at-1') return json({}, 401);
    if (state.driveDown) return json({ error: { code: 500 } }, 500);

    const upload = url.pathname.startsWith('/upload/drive/v3/files');
    const path = url.pathname.replace('/upload', '').replace('/drive/v3', '');

    if (path === '/about') return json({ user: { emailAddress: state.email } });

    if (path === '/files' && method === 'GET') {
      const q = url.searchParams.get('q') ?? '';
      const name = /name = '((?:[^'\\]|\\.)*)'/.exec(q)?.[1];
      const found = [...files.values()].find(
        (file) =>
          file.mimeType === 'application/vnd.google-apps.folder' &&
          file.name === name &&
          !file.trashed,
      );
      return json({ files: found ? [publicFile(found)] : [] });
    }

    if (path === '/files' && method === 'POST' && upload) {
      const { metadata, content } = parseMultipart(request.headers.get('Content-Type') ?? '', await request.text());
      return json(
        publicFile(
          create({
            name: metadata.name,
            mimeType: metadata.mimeType,
            parents: metadata.parents,
            content,
          }),
        ),
      );
    }

    if (path === '/files' && method === 'POST') {
      const metadata = (await request.json()) as { name: string; mimeType: string; parents?: string[] };
      return json(
        publicFile(
          create({
            name: metadata.name,
            mimeType: metadata.mimeType,
            parents: metadata.parents ?? [],
            content: '',
          }),
        ),
      );
    }

    const match = /^\/files\/([^/]+)$/.exec(path);
    const file = match?.[1] ? files.get(decodeURIComponent(match[1])) : undefined;
    if (match) {
      if (!file) return json({ error: { code: 404 } }, 404);
      if (method === 'PATCH') {
        file.content = await request.text();
        return json(publicFile(file));
      }
      if (url.searchParams.get('alt') === 'media') return new Response(file.content);
      return json(publicFile(file));
    }
    return json({ error: 'desconhecido' }, 404);
  };

  return {
    fetch: fetcher,
    files,
    calls,
    emails,
    revoked,
    state,
    /** Um arquivo que a pessoa escolheu no Picker (já visível para o app). */
    addFile(name: string, content: string): FakeFile {
      return create({ name, mimeType: 'application/json', parents: [], content });
    },
    folders: () =>
      [...files.values()].filter((f) => f.mimeType === 'application/vnd.google-apps.folder'),
    driveCalls: (method: string, pattern: RegExp) =>
      calls.filter((call) => call.method === method && pattern.test(call.url)),
  };
}

export type FakeGoogle = ReturnType<typeof createFakeGoogle>;

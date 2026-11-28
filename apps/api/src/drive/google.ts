import { TRAMA_FILE_MIME_TYPE } from '@trama/core';

/**
 * Cliente mínimo do Google: OAuth 2.0 (código, renovação e revogação) e o que o Trama usa da
 * API do Drive v3. Recebe o `fetch`, para os testes trocarem o Google por um falso.
 */

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** Maior `.trama` que a API aceita ler do Drive (5 MB de conteúdo, mais o envelope). */
export const MAX_TRAMA_FILE_BYTES = 5 * 1024 * 1024 + 64 * 1024;

/**
 * O Google recusou. `auth`: o acesso foi revogado ou venceu (a pessoa precisa conectar de novo);
 * `not_found`: o arquivo ou a pasta não existe (ou o app não tem acesso a ele);
 * `other`: erro do Google ou de rede.
 */
export class GoogleError extends Error {
  constructor(
    message: string,
    readonly kind: 'auth' | 'not_found' | 'other',
    readonly status = 0,
  ) {
    super(message);
    this.name = 'GoogleError';
  }
}

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
}

export interface AccessToken {
  accessToken: string;
  /** Segundos até vencer. */
  expiresIn: number;
}

export interface DriveFile {
  id: string;
  name?: string;
  size?: number;
  trashed?: boolean;
  mimeType?: string;
}

export interface Google {
  authUrl(input: { redirectUri: string; state: string }): string;
  exchangeCode(code: string, redirectUri: string): Promise<AccessToken & { refreshToken?: string }>;
  refresh(refreshToken: string): Promise<AccessToken>;
  revoke(token: string): Promise<void>;
  accountEmail(accessToken: string): Promise<string | null>;
  getFile(accessToken: string, fileId: string): Promise<DriveFile | null>;
  findFolder(accessToken: string, name: string, parentId?: string): Promise<DriveFile | null>;
  createFolder(accessToken: string, name: string, parentId?: string): Promise<DriveFile>;
  createFile(
    accessToken: string,
    input: { name: string; parentId: string; body: string },
  ): Promise<DriveFile>;
  /** Troca o conteúdo de um arquivo que já existe; null quando ele não existe mais. */
  updateFile(accessToken: string, fileId: string, body: string): Promise<DriveFile | null>;
  downloadText(accessToken: string, fileId: string): Promise<string | null>;
}

interface RawFile {
  id?: unknown;
  name?: unknown;
  size?: unknown;
  trashed?: unknown;
  mimeType?: unknown;
}

function toFile(raw: unknown): DriveFile {
  const file = (raw ?? {}) as RawFile;
  if (typeof file.id !== 'string') throw new GoogleError('Resposta do Drive sem id.', 'other');
  return {
    id: file.id,
    ...(typeof file.name === 'string' ? { name: file.name } : {}),
    ...(typeof file.size === 'string' ? { size: Number(file.size) } : {}),
    ...(typeof file.trashed === 'boolean' ? { trashed: file.trashed } : {}),
    ...(typeof file.mimeType === 'string' ? { mimeType: file.mimeType } : {}),
  };
}

const FILE_FIELDS = 'id,name,size,trashed,mimeType';

/** Aspas e barras do nome entram escapadas na busca (`q`) do Drive. */
function quote(text: string): string {
  return `'${text.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

export function createGoogle(
  config: GoogleConfig,
  fetcher: typeof fetch = (...args) => fetch(...args),
): Google {
  async function request(url: string, init: RequestInit, accessToken?: string): Promise<Response> {
    try {
      return await fetcher(url, {
        ...init,
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...init.headers,
        },
      });
    } catch {
      throw new GoogleError('Não deu para falar com o Google agora.', 'other');
    }
  }

  /** Erro de uma chamada ao Drive, com o tipo certo. 404 só vira erro se `allowMissing` for falso. */
  async function fail(response: Response, what: string): Promise<never> {
    const status = response.status;
    await response.body?.cancel().catch(() => undefined);
    if (status === 401) throw new GoogleError('O Google recusou o acesso.', 'auth', status);
    if (status === 404) throw new GoogleError(`${what}: não encontrado.`, 'not_found', status);
    throw new GoogleError(`${what}: o Google respondeu ${String(status)}.`, 'other', status);
  }

  async function token(body: Record<string, string>): Promise<Record<string, unknown>> {
    const response = await request(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        ...body,
      }),
    });
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      // invalid_grant: o código já foi usado, venceu, ou a pessoa revogou o acesso.
      const kind = json.error === 'invalid_grant' ? 'auth' : 'other';
      throw new GoogleError(
        `Troca de token recusada (${typeof json.error === 'string' ? json.error : String(response.status)}).`,
        kind,
        response.status,
      );
    }
    return json;
  }

  const accessOf = (json: Record<string, unknown>): AccessToken => {
    if (typeof json.access_token !== 'string' || typeof json.expires_in !== 'number') {
      throw new GoogleError('O Google respondeu sem token de acesso.', 'other');
    }
    return { accessToken: json.access_token, expiresIn: json.expires_in };
  };

  return {
    authUrl({ redirectUri, state }) {
      const url = new URL(AUTH_URL);
      url.search = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: DRIVE_SCOPE,
        // offline + consent: o Google sempre devolve um refresh token, mesmo numa reconexão.
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'false',
        state,
      }).toString();
      return url.toString();
    },

    async exchangeCode(code, redirectUri) {
      const json = await token({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      });
      return {
        ...accessOf(json),
        ...(typeof json.refresh_token === 'string' ? { refreshToken: json.refresh_token } : {}),
      };
    },

    async refresh(refreshToken) {
      return accessOf(await token({ grant_type: 'refresh_token', refresh_token: refreshToken }));
    },

    async revoke(refreshToken) {
      const response = await request(REVOKE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: refreshToken }),
      });
      await response.body?.cancel().catch(() => undefined);
    },

    async accountEmail(accessToken) {
      const response = await request(
        `${DRIVE_API}/about?fields=${encodeURIComponent('user(emailAddress)')}`,
        {},
        accessToken,
      );
      if (!response.ok) return null;
      const json = (await response.json().catch(() => ({}))) as {
        user?: { emailAddress?: unknown };
      };
      return typeof json.user?.emailAddress === 'string' ? json.user.emailAddress : null;
    },

    async getFile(accessToken, fileId) {
      const response = await request(
        `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=${FILE_FIELDS}`,
        {},
        accessToken,
      );
      if (response.status === 404) return null;
      if (!response.ok) return fail(response, 'Ler o arquivo');
      return toFile(await response.json());
    },

    async findFolder(accessToken, name, parentId) {
      const query = [
        `mimeType = '${FOLDER_MIME}'`,
        `name = ${quote(name)}`,
        'trashed = false',
        ...(parentId ? [`${quote(parentId)} in parents`] : []),
      ].join(' and ');
      const response = await request(
        `${DRIVE_API}/files?${new URLSearchParams({
          q: query,
          fields: `files(${FILE_FIELDS})`,
          pageSize: '1',
          spaces: 'drive',
        }).toString()}`,
        {},
        accessToken,
      );
      if (!response.ok) return fail(response, 'Procurar a pasta');
      const json = (await response.json()) as { files?: unknown[] };
      const first = json.files?.[0];
      return first ? toFile(first) : null;
    },

    async createFolder(accessToken, name, parentId) {
      const response = await request(
        `${DRIVE_API}/files?fields=${FILE_FIELDS}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            mimeType: FOLDER_MIME,
            ...(parentId ? { parents: [parentId] } : {}),
          }),
        },
        accessToken,
      );
      if (!response.ok) return fail(response, 'Criar a pasta');
      return toFile(await response.json());
    },

    async createFile(accessToken, { name, parentId, body }) {
      const boundary = `trama-${crypto.randomUUID()}`;
      const metadata = JSON.stringify({
        name,
        parents: [parentId],
        mimeType: TRAMA_FILE_MIME_TYPE,
      });
      const multipart =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
        `--${boundary}\r\nContent-Type: ${TRAMA_FILE_MIME_TYPE}; charset=UTF-8\r\n\r\n${body}\r\n` +
        `--${boundary}--`;
      const response = await request(
        `${UPLOAD_API}/files?uploadType=multipart&fields=${FILE_FIELDS}`,
        {
          method: 'POST',
          headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
          body: multipart,
        },
        accessToken,
      );
      if (!response.ok) return fail(response, 'Criar o arquivo');
      return toFile(await response.json());
    },

    async updateFile(accessToken, fileId, body) {
      const response = await request(
        `${UPLOAD_API}/files/${encodeURIComponent(fileId)}?uploadType=media&fields=${FILE_FIELDS}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': `${TRAMA_FILE_MIME_TYPE}; charset=UTF-8` },
          body,
        },
        accessToken,
      );
      if (response.status === 404) return null;
      if (!response.ok) return fail(response, 'Atualizar o arquivo');
      return toFile(await response.json());
    },

    async downloadText(accessToken, fileId) {
      const response = await request(
        `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`,
        {},
        accessToken,
      );
      if (response.status === 404) return null;
      if (!response.ok) return fail(response, 'Baixar o arquivo');
      return response.text();
    },
  };
}

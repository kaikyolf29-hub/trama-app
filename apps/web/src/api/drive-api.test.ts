import { describe, expect, it, vi } from 'vitest';
import { createAccountApi } from './account-api';
import { createDriveApi } from './drive-api';
import { ApiError } from './http';

const status = {
  available: true,
  connected: true,
  email: 'ana@gmail.example',
  folderUrl: null,
  lastCopyAt: null,
  consecutiveFailures: 0,
  lastError: null,
};

function setup(respond: (url: string, init?: RequestInit) => Response) {
  const fetcher = vi.fn<typeof fetch>((input, init) =>
    Promise.resolve(respond(input instanceof Request ? input.url : input.toString(), init)),
  );
  const config = {
    baseUrl: 'https://api.exemplo/',
    getToken: () => Promise.resolve('tok'),
    fetch: fetcher,
  };
  return { drive: createDriveApi(config), account: createAccountApi(config), fetcher };
}

const json = (body: unknown, code = 200) => new Response(JSON.stringify(body), { status: code });

describe('cliente da API do Drive', () => {
  it('lê o estado com o token e valida a resposta', async () => {
    const { drive, fetcher } = setup(() => json(status));
    expect((await drive.status()).email).toBe('ana@gmail.example');
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe('https://api.exemplo/drive/status');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer tok');
  });

  it('recusa resposta fora do contrato', async () => {
    const { drive } = setup(() => json({ connected: 'sim' }));
    await expect(drive.status()).rejects.toMatchObject({ status: 502 });
  });

  it('começa a conectar mandando o caminho de volta, e entrega o bilhete', async () => {
    const { drive, fetcher } = setup((url) =>
      url.endsWith('/drive/connect')
        ? json({ url: 'https://accounts.google.com/x' })
        : json(status),
    );
    expect(await drive.startConnect('/p/abc')).toEqual({ url: 'https://accounts.google.com/x' });
    expect(fetcher.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ returnTo: '/p/abc' }));
    await drive.finishConnect('v1.iv.cifra');
    expect(fetcher.mock.calls[1]?.[0]).toBe('https://api.exemplo/drive/connection');
    expect(fetcher.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ ticket: 'v1.iv.cifra' }));
  });

  it('desconecta com DELETE (resposta 204 sem corpo)', async () => {
    const { drive, fetcher } = setup(() => new Response(null, { status: 204 }));
    await expect(drive.disconnect()).resolves.toBeUndefined();
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe('DELETE');
  });

  it('copia o projeto, com keepalive quando pedido', async () => {
    const { drive, fetcher } = setup(() =>
      json({ driveFileId: 'abc', copiedAt: '2026-11-27T12:00:00.000Z' }),
    );
    await drive.copyProject('id com espaço', { keepalive: true });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe('https://api.exemplo/drive/projects/id%20com%20espa%C3%A7o/copy');
    expect(init).toMatchObject({ method: 'POST', keepalive: true });
  });

  it('o erro da API vira ApiError em português', async () => {
    const { drive } = setup(() => json({ error: 'O Google Drive não está conectado.' }, 409));
    await expect(drive.copyProject('x')).rejects.toEqual(
      new ApiError('O Google Drive não está conectado.', 409),
    );
  });

  it('pede o token do Picker e importa o arquivo escolhido', async () => {
    const { drive, fetcher } = setup((url) =>
      url.endsWith('/picker-token')
        ? json({ accessToken: 'at', expiresIn: 3599 })
        : json({
            projectId: '6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f',
            created: true,
            replacedPrevious: false,
          }),
    );
    expect(await drive.pickerToken()).toEqual({ accessToken: 'at', expiresIn: 3599 });
    expect((await drive.importFile('arquivo12345')).created).toBe(true);
    expect(fetcher.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ fileId: 'arquivo12345' }));
  });

  it('pede as boas-vindas', async () => {
    const { account, fetcher } = setup(() => json({ sent: true }));
    await account.sendWelcome();
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.exemplo/account/welcome');
  });
});

import { createEmptyFlow } from '@trama/core';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, createProjectsApi } from './projects-api';

const project = {
  id: '6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f',
  kind: 'flow',
  title: 'Vídeo',
  status: 'draft',
  revision: 1,
  driveFileId: null,
  createdAt: '2026-11-27T10:00:00.000Z',
  updatedAt: '2026-11-27T10:00:00.000Z',
  content: createEmptyFlow(),
};

function setup(respond: () => Promise<Response>, token: string | null = 'tok') {
  const fetcher = vi.fn<typeof fetch>(respond);
  const api = createProjectsApi({
    baseUrl: 'https://api.exemplo/',
    getToken: () => Promise.resolve(token),
    fetch: fetcher,
  });
  return { api, fetcher };
}

const json =
  (body: unknown, status = 200) =>
  () =>
    Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('cliente da API de projetos', () => {
  it('manda o token e valida o projeto que volta', async () => {
    const { api, fetcher } = setup(json(project));
    const loaded = await api.get(project.id);
    expect(loaded.title).toBe('Vídeo');
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe(`https://api.exemplo/projects/${project.id}`);
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer tok');
  });

  it('salva com PUT, corpo em JSON e keepalive quando pedido', async () => {
    const { api, fetcher } = setup(
      json({ revision: 2, updatedAt: '2026-11-27T10:00:02.000Z', overwrote: false }),
    );
    const saved = await api.save(
      project.id,
      { content: createEmptyFlow(), baseRevision: 1 },
      { keepalive: true },
    );
    expect(saved.revision).toBe(2);
    const init = fetcher.mock.calls[0]?.[1];
    expect(init?.method).toBe('PUT');
    expect(init?.keepalive).toBe(true);
    expect(typeof init?.body === 'string' && JSON.parse(init.body)).toMatchObject({
      baseRevision: 1,
    });
  });

  it('erro da API chega em português, com o status', async () => {
    const { api } = setup(json({ error: 'Projeto não encontrado.' }, 404));
    await expect(api.get(project.id)).rejects.toMatchObject({
      message: 'Projeto não encontrado.',
      status: 404,
    });
  });

  it('sem conexão vira status 0, e sem login nem chama a API', async () => {
    const offline = setup(() => Promise.reject(new TypeError('Failed to fetch')));
    await expect(offline.api.list()).rejects.toMatchObject({ status: 0 });
    const signedOut = setup(json([]), null);
    await expect(signedOut.api.list()).rejects.toBeInstanceOf(ApiError);
    expect(signedOut.fetcher).not.toHaveBeenCalled();
  });

  it('recusa resposta fora do contrato', async () => {
    const { api } = setup(json({ ...project, content: { blocks: 'quebrado' } }));
    await expect(api.get(project.id)).rejects.toMatchObject({ status: 502 });
  });
});

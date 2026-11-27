import {
  createEmptyFlow,
  projectSummarySchema,
  projectVersionSchema,
  saveProjectResponseSchema,
} from '@trama/core';
import { videoFlowExample } from '@trama/core/fixtures';
import { describe, expect, it } from 'vitest';
import { createApp, isAllowedOrigin, type Env } from '../index';
import { createMemoryStore } from './memory-store';
import { SessionError, type ProjectStore } from './store';

const TOKEN = 'token-da-ana';

function setup(store: ProjectStore = createMemoryStore()) {
  const tokens: string[] = [];
  const app = createApp((_env, token) => {
    tokens.push(token);
    return store;
  });
  const call = (path: string, init: RequestInit = {}) =>
    app.request(path, {
      ...init,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
  const json = async <T>(response: Response) => (await response.json()) as T;
  return { app, call, json, tokens };
}

describe('API de projetos', () => {
  it('exige o token de login e passa o token para o banco', async () => {
    const { app, call, tokens } = setup();
    const response = await app.request('/projects');
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Entre na sua conta para continuar.' });
    expect((await call('/projects')).status).toBe(200);
    expect(tokens).toEqual([TOKEN]);
  });

  it('cria, lista, abre, salva e apaga um fluxo', async () => {
    const { call, json } = setup();
    const created = await call('/projects', {
      method: 'POST',
      body: JSON.stringify({ kind: 'flow', title: ' Vídeo novo ' }),
    });
    expect(created.status).toBe(201);
    const project = await json<{ id: string; title: string; revision: number; content: unknown }>(
      created,
    );
    expect(project).toMatchObject({ title: 'Vídeo novo', revision: 1, content: createEmptyFlow() });

    const list = await json<unknown[]>(await call('/projects'));
    expect(list.map((item) => projectSummarySchema.parse(item).id)).toEqual([project.id]);

    const saved = await call(`/projects/${project.id}`, {
      method: 'PUT',
      body: JSON.stringify({ content: videoFlowExample, baseRevision: 1 }),
    });
    expect(saveProjectResponseSchema.parse(await saved.json())).toMatchObject({
      revision: 2,
      overwrote: false,
    });

    const opened = await json<{ content: { blocks: unknown[] } }>(
      await call(`/projects/${project.id}`),
    );
    expect(opened.content.blocks.length).toBe(videoFlowExample.blocks.length);

    expect((await call(`/projects/${project.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await call(`/projects/${project.id}`)).status).toBe(404);
  });

  it('recusa fluxo inválido antes de chegar no banco', async () => {
    const store = createMemoryStore();
    const { call, json } = setup(store);
    const { id } = await json<{ id: string }>(
      await call('/projects', { method: 'POST', body: JSON.stringify({ kind: 'flow' }) }),
    );
    const broken = {
      ...createEmptyFlow(),
      arrows: [{ id: 'a', from: { nodeId: 'x' }, to: { nodeId: 'y' } }],
    };
    const response = await call(`/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ content: broken, baseRevision: 1 }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'O fluxo enviado não é válido.' });
    expect(store.projects.get(id)?.revision).toBe(1);
    expect((await call('/projects', { method: 'POST', body: '{não é json' })).status).toBe(400);
    expect(
      (await call('/projects', { method: 'POST', body: JSON.stringify({ kind: 'script' }) }))
        .status,
    ).toBe(400);
  });

  it('gravação com revisão velha vale, avisa e guarda a substituída no histórico', async () => {
    const { call, json } = setup();
    const { id } = await json<{ id: string }>(
      await call('/projects', { method: 'POST', body: JSON.stringify({ kind: 'flow' }) }),
    );
    const save = (baseRevision: number) =>
      call(`/projects/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ content: createEmptyFlow(), baseRevision }),
      });
    await save(1);
    const late = saveProjectResponseSchema.parse(await (await save(1)).json());
    expect(late).toMatchObject({ revision: 3, overwrote: true });

    const versions = (await json<unknown[]>(await call(`/projects/${id}/versions`))).map((v) =>
      projectVersionSchema.parse(v),
    );
    expect(versions.map((v) => v.reason)).toEqual(['conflict', 'autosave']);

    const restored = await call(`/projects/${id}/versions/${versions[1]?.id}/restore`, {
      method: 'POST',
    });
    expect(await restored.json()).toMatchObject({ revision: 4 });
    expect((await call(`/projects/${id}/versions/999/restore`, { method: 'POST' })).status).toBe(
      404,
    );
  });

  it('id que não é uuid é 404, sem ir ao banco', async () => {
    const { call } = setup();
    expect((await call('/projects/nao-e-uuid')).status).toBe(404);
    expect((await call('/projects/nao-e-uuid', { method: 'DELETE' })).status).toBe(404);
  });

  it('sessão vencida vira 401 com mensagem em português', async () => {
    const store = createMemoryStore();
    store.list = () => Promise.reject(new SessionError());
    const { call } = setup(store);
    const response = await call('/projects');
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: 'Sua sessão acabou. Entre de novo para continuar.',
    });
  });

  it('recusa corpo maior que 5 MB', async () => {
    const { call } = setup();
    const response = await call('/projects', {
      method: 'POST',
      body: JSON.stringify({ kind: 'flow', title: 'x'.repeat(6 * 1024 * 1024) }),
    });
    expect(response.status).toBe(413);
  });
});

describe('CORS', () => {
  const env: Env = { WORKERS_SUBDOMAIN: 'conta' };

  it('aceita o site, os previews e o pnpm dev', () => {
    expect(isAllowedOrigin('https://trama.conta.workers.dev', env)).toBe(true);
    expect(isAllowedOrigin('https://pr-12-trama.conta.workers.dev', env)).toBe(true);
    expect(isAllowedOrigin('http://localhost:5173', {})).toBe(true);
  });

  it('recusa qualquer outro site', () => {
    expect(isAllowedOrigin('https://trama.outra.workers.dev', env)).toBe(false);
    expect(isAllowedOrigin('https://golpe.com', env)).toBe(false);
    expect(isAllowedOrigin('https://trama.conta.workers.dev.golpe.com', env)).toBe(false);
    expect(isAllowedOrigin('https://trama.conta.workers.dev', { WORKERS_SUBDOMAIN: 'a.*' })).toBe(
      false,
    );
  });

  it('responde ao preflight só para origem aceita', async () => {
    const { app } = setup();
    const preflight = (origin: string) =>
      app.request(
        '/projects',
        {
          method: 'OPTIONS',
          headers: { Origin: origin, 'Access-Control-Request-Method': 'PUT' },
        },
        env,
      );
    expect(
      (await preflight('https://trama.conta.workers.dev')).headers.get(
        'Access-Control-Allow-Origin',
      ),
    ).toBe('https://trama.conta.workers.dev');
    expect(
      (await preflight('https://golpe.com')).headers.get('Access-Control-Allow-Origin'),
    ).toBeNull();
  });
});

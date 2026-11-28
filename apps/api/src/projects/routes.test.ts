import {
  createEmptyFlow,
  createEmptyScript,
  createScene,
  flowContentSchema,
  projectSummarySchema,
  projectVersionSchema,
  saveProjectResponseSchema,
  scriptContentSchema,
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
      (await call('/projects', { method: 'POST', body: JSON.stringify({ kind: 'notebook' }) }))
        .status,
    ).toBe(400);
  });

  it('cria, abre, salva e valida um roteiro', async () => {
    const store = createMemoryStore();
    const { call, json } = setup(store);
    const created = await call('/projects', {
      method: 'POST',
      body: JSON.stringify({ kind: 'script', title: ' Episódio 12 ' }),
    });
    expect(created.status).toBe(201);
    const project = await json<{ id: string; kind: string; content: unknown }>(created);
    expect(project).toMatchObject({ kind: 'script', content: createEmptyScript() });

    const content = {
      ...createEmptyScript(),
      targetDuration: '8–10 min',
      scenes: [createScene({ title: 'Gancho', narration: 'Oi', broll: ['Plano aberto'] })],
    };
    const saved = await call(`/projects/${project.id}`, {
      method: 'PUT',
      body: JSON.stringify({ content, baseRevision: 1 }),
    });
    expect(saveProjectResponseSchema.parse(await saved.json())).toMatchObject({ revision: 2 });
    const opened = await json<{ kind: string; content: unknown }>(
      await call(`/projects/${project.id}`),
    );
    expect(opened.kind).toBe('script');
    expect(scriptContentSchema.parse(opened.content)).toEqual(content);

    // Cena repetida e cartão ligado a duas cenas não passam.
    const card = { cardId: 'cartao-1' };
    for (const broken of [
      { ...content, scenes: [content.scenes[0], content.scenes[0]] },
      {
        ...content,
        scenes: [createScene({ title: 'A', ...card }), createScene({ title: 'B', ...card })],
      },
    ]) {
      const response = await call(`/projects/${project.id}`, {
        method: 'PUT',
        body: JSON.stringify({ content: broken, baseRevision: 2 }),
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'O roteiro enviado não é válido.' });
    }
    expect(store.projects.get(project.id)?.revision).toBe(2);
  });

  it('um fluxo não aceita o conteúdo de um roteiro', async () => {
    const { call, json } = setup();
    const flow = await json<{ id: string }>(
      await call('/projects', { method: 'POST', body: JSON.stringify({ kind: 'flow' }) }),
    );
    const response = await call(`/projects/${flow.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        content: { scenes: [createScene({ title: 'A' })] },
        baseRevision: 1,
      }),
    });
    expect(response.status).toBe(400);
  });

  it('salvar um projeto que não existe é 404, mesmo com corpo inválido', async () => {
    const { call } = setup();
    const response = await call(`/projects/${crypto.randomUUID()}`, {
      method: 'PUT',
      body: '{}',
    });
    expect(response.status).toBe(404);
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

  it('renomeia e muda o status sem mexer no conteúdo nem na revisão', async () => {
    const store = createMemoryStore();
    const { call, json } = setup(store);
    const created = await json<{ id: string }>(
      await call('/projects', {
        method: 'POST',
        body: JSON.stringify({ kind: 'flow', title: 'Antes', content: videoFlowExample }),
      }),
    );
    const patch = (body: unknown) =>
      call(`/projects/${created.id}`, { method: 'PATCH', body: JSON.stringify(body) });

    const renamed = await patch({ title: '  Depois  ' });
    expect(renamed.status).toBe(200);
    expect(projectSummarySchema.parse(await renamed.json())).toMatchObject({
      id: created.id,
      title: 'Depois',
      status: 'draft',
      revision: 1,
    });

    const done = projectSummarySchema.parse(await (await patch({ status: 'done' })).json());
    expect(done).toMatchObject({ title: 'Depois', status: 'done', revision: 1 });

    const stored = store.projects.get(created.id);
    expect(stored).toMatchObject({ title: 'Depois', status: 'done', revision: 1 });
    expect(flowContentSchema.parse(stored?.content).blocks).toHaveLength(
      videoFlowExample.blocks.length,
    );
  });

  it('PATCH recusa corpo vazio, título em branco e status desconhecido', async () => {
    const store = createMemoryStore();
    const { call, json } = setup(store);
    const { id } = await json<{ id: string }>(
      await call('/projects', { method: 'POST', body: JSON.stringify({ kind: 'flow' }) }),
    );
    for (const body of [{}, { title: '   ' }, { status: 'arquivado' }, { title: 3 }]) {
      const response = await call(`/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(400);
    }
    expect((await call(`/projects/${id}`, { method: 'PATCH', body: '{não é json' })).status).toBe(
      400,
    );
    expect(store.projects.get(id)).toMatchObject({ title: 'Sem título', status: 'draft' });
  });

  it('PATCH de projeto que não existe, ou de id que não é uuid, é 404', async () => {
    const { call } = setup();
    const patch = (id: string) =>
      call(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify({ title: 'x' }) });
    expect((await patch('00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await patch('nao-e-uuid')).status).toBe(404);
  });

  it('PATCH exige o token de login', async () => {
    const { app } = setup();
    const response = await app.request('/projects/00000000-0000-4000-8000-000000000000', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'x' }),
    });
    expect(response.status).toBe(401);
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

  it('libera o PATCH no preflight (renomear e mudar o status)', async () => {
    const { app } = setup();
    const response = await app.request(
      '/projects/x',
      {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://trama.conta.workers.dev',
          'Access-Control-Request-Method': 'PATCH',
        },
      },
      env,
    );
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('PATCH');
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

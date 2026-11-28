import { createEmptyFlow, lessonSchema, notebookProjectSchema, type Lesson } from '@trama/core';
import { describe, expect, it } from 'vitest';
import { createApp } from '../index';
import { createMemoryStore } from '../projects/memory-store';
import { createMemoryOrganizationStore } from './memory-store';

const TOKEN = 'token-da-ana';
const MISSING = '99999999-9999-4999-8999-999999999999';

function setup() {
  // Relógio que anda 1 s a cada leitura: dois cadernos nunca nascem no mesmo instante.
  let tick = 0;
  const projects = createMemoryStore(() => new Date(Date.UTC(2026, 10, 12, 12, 0, tick++)));
  const organization = createMemoryOrganizationStore();
  const app = createApp(() => projects, { organization: () => organization });
  const call = (path: string, init: RequestInit = {}) =>
    app.request(path, {
      ...init,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
  const send = (method: string, path: string, body: unknown) =>
    call(path, { method, body: JSON.stringify(body) });
  const create = async (body: unknown = { title: 'Premiere Pro' }) =>
    notebookProjectSchema.parse(await (await send('POST', '/notebooks', body)).json());
  return { app, call, send, create, projects, organization };
}

describe('POST /notebooks', () => {
  it('exige o token de login', async () => {
    const { app } = setup();
    const response = await app.request('/notebooks', { method: 'POST', body: '{}' });
    expect(response.status).toBe(401);
  });

  it('cria um caderno com os padrões (azul, revisão em 7 dias) e devolve 201', async () => {
    const { send, projects } = setup();
    const response = await send('POST', '/notebooks', { title: ' Premiere Pro ' });
    expect(response.status).toBe(201);
    const notebook = notebookProjectSchema.parse(await response.json());
    expect(notebook).toMatchObject({
      kind: 'notebook',
      title: 'Premiere Pro',
      status: 'draft',
      content: { color: 'blue', reviewAfterDays: 7, description: '' },
    });
    expect(projects.projects.get(notebook.id)?.kind).toBe('notebook');
  });

  it('aceita cor, descrição e intervalo na criação', async () => {
    const { create } = setup();
    const notebook = await create({
      title: 'Inglês',
      content: { color: 'green', description: 'Aulas de terça', reviewAfterDays: 3 },
    });
    expect(notebook.content).toMatchObject({
      color: 'green',
      description: 'Aulas de terça',
      reviewAfterDays: 3,
    });
  });

  it('recusa título vazio, cor fora dos tokens e corpo quebrado', async () => {
    const { send, call } = setup();
    expect((await send('POST', '/notebooks', { title: '  ' })).status).toBe(400);
    expect(
      (await send('POST', '/notebooks', { title: 'A', content: { color: '#ff0000' } })).status,
    ).toBe(400);
    expect((await call('/notebooks', { method: 'POST', body: '{nada' })).status).toBe(400);
  });
});

describe('GET /notebooks', () => {
  it('lista só cadernos, com o conteúdo, do mais antigo ao mais novo', async () => {
    const { call, create, projects } = setup();
    await projects.create({ kind: 'flow', title: 'Um fluxo', content: createEmptyFlow() });
    const first = await create({ title: 'Premiere Pro', content: { color: 'blue' } });
    const second = await create({ title: 'Inglês', content: { color: 'green' } });
    const list = (await (await call('/notebooks')).json()) as unknown[];
    expect(list.map((item) => notebookProjectSchema.parse(item).id)).toEqual([first.id, second.id]);
    expect(notebookProjectSchema.parse(list[1]).content.color).toBe('green');
  });

  it('um caderno com conteúdo {} no banco volta com os padrões', async () => {
    const { call, projects } = setup();
    const raw = await projects.create({
      kind: 'notebook',
      title: 'Antigo',
      content: {} as never,
    });
    const [notebook] = (await (await call('/notebooks')).json()) as unknown[];
    expect(notebookProjectSchema.parse(notebook)).toMatchObject({
      id: raw.id,
      content: { color: 'blue', reviewAfterDays: 7 },
    });
  });
});

describe('GET /notebooks/:id', () => {
  it('abre o caderno; fluxo, id solto ou de outra pessoa dão 404', async () => {
    const { call, create, projects } = setup();
    const notebook = await create();
    const flow = await projects.create({
      kind: 'flow',
      title: 'Fluxo',
      content: createEmptyFlow(),
    });
    expect((await call(`/notebooks/${notebook.id}`)).status).toBe(200);
    for (const id of [flow.id, MISSING, 'nao-e-id']) {
      const response = await call(`/notebooks/${id}`);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'Caderno não encontrado.' });
    }
  });
});

describe('PATCH /notebooks/:id', () => {
  it('muda a cor e o intervalo, sobe a revisão e mantém o resto', async () => {
    const { send, create } = setup();
    const notebook = await create({ title: 'Inglês', content: { description: 'Terça' } });
    const response = await send('PATCH', `/notebooks/${notebook.id}`, {
      color: 'pink',
      reviewAfterDays: 14,
    });
    expect(response.status).toBe(200);
    const updated = notebookProjectSchema.parse(await response.json());
    expect(updated.content).toMatchObject({
      color: 'pink',
      reviewAfterDays: 14,
      description: 'Terça',
    });
    expect(updated.title).toBe('Inglês');
    expect(updated.revision).toBe(notebook.revision + 1);
  });

  it('renomear junto com o conteúdo grava tudo de uma vez', async () => {
    const { send, create } = setup();
    const notebook = await create();
    const updated = notebookProjectSchema.parse(
      await (
        await send('PATCH', `/notebooks/${notebook.id}`, {
          title: 'Edição de vídeo',
          color: 'yellow',
        })
      ).json(),
    );
    expect(updated).toMatchObject({ title: 'Edição de vídeo', content: { color: 'yellow' } });
  });

  it('só renomear não sobe a revisão', async () => {
    const { send, create } = setup();
    const notebook = await create();
    const updated = notebookProjectSchema.parse(
      await (await send('PATCH', `/notebooks/${notebook.id}`, { title: 'Outro nome' })).json(),
    );
    expect(updated).toMatchObject({ title: 'Outro nome', revision: notebook.revision });
  });

  it('recusa corpo vazio ou inválido e responde 404 para o que não é caderno', async () => {
    const { send, create, projects } = setup();
    const notebook = await create();
    const flow = await projects.create({
      kind: 'flow',
      title: 'Fluxo',
      content: createEmptyFlow(),
    });
    expect((await send('PATCH', `/notebooks/${notebook.id}`, {})).status).toBe(400);
    expect((await send('PATCH', `/notebooks/${notebook.id}`, { color: 'red' })).status).toBe(400);
    expect((await send('PATCH', `/notebooks/${flow.id}`, { title: 'X' })).status).toBe(404);
    expect((await send('PATCH', `/notebooks/${MISSING}`, { title: 'X' })).status).toBe(404);
  });
});

describe('GET /lessons', () => {
  it('devolve as aulas de todos os cadernos, agrupadas por caderno e na ordem de cada um', async () => {
    const { call, send, create, organization } = setup();
    const a = await create({ title: 'A' });
    const b = await create({ title: 'B' });
    for (const notebook of [a, b]) organization.projects.set(notebook.id, 'notebook');
    const lessonOf = async (notebookId: string, title: string, position: number) =>
      lessonSchema.parse(
        await (await send('POST', `/notebooks/${notebookId}/lessons`, { title, position })).json(),
      );
    await lessonOf(b.id, 'B2', 1);
    await lessonOf(a.id, 'A2', 1);
    await lessonOf(b.id, 'B1', 0);
    await lessonOf(a.id, 'A1', 0);
    const response = await call('/lessons');
    expect(response.status).toBe(200);
    const lessons = ((await response.json()) as unknown[]).map((l) => lessonSchema.parse(l));
    const byNotebook = (id: string) => lessons.filter((l: Lesson) => l.notebookId === id);
    expect(byNotebook(a.id).map((l) => l.title)).toEqual(['A1', 'A2']);
    expect(byNotebook(b.id).map((l) => l.title)).toEqual(['B1', 'B2']);
    // Cada caderno vem em bloco, sem misturar.
    expect(lessons.map((l) => l.notebookId)).toEqual([...lessons.map((l) => l.notebookId)].sort());
  });

  it('exige o token de login', async () => {
    const { app } = setup();
    expect((await app.request('/lessons')).status).toBe(401);
  });
});

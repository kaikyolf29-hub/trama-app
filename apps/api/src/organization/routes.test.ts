import { eventSchema, lessonSchema, type AgendaEvent } from '@trama/core';
import { describe, expect, it } from 'vitest';
import { createApp } from '../index';
import { createMemoryStore } from '../projects/memory-store';
import { createMemoryOrganizationStore } from './memory-store';
import { SessionError } from '../projects/store';
import type { OrganizationStore } from './store';

const TOKEN = 'token-da-ana';
const NOTEBOOK = '44444444-4444-4444-8444-444444444444';
const FLOW = '33333333-3333-4333-8333-333333333333';

function setup(store = createMemoryOrganizationStore()) {
  store.projects.set(NOTEBOOK, 'notebook');
  store.projects.set(FLOW, 'flow');
  const tokens: string[] = [];
  const app = createApp(
    () => createMemoryStore(),
    (_env, token) => {
      tokens.push(token);
      return store;
    },
  );
  const call = (path: string, init: RequestInit = {}) =>
    app.request(path, {
      ...init,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
  const post = (path: string, body: unknown) =>
    call(path, { method: 'POST', body: JSON.stringify(body) });
  const patch = (path: string, body: unknown) =>
    call(path, { method: 'PATCH', body: JSON.stringify(body) });
  const json = async <T>(response: Response) => (await response.json()) as T;
  return { app, call, post, patch, json, store, tokens };
}

function autoEvent(n: number, occurredAt: string): AgendaEvent {
  return eventSchema.parse({
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    type: 'created',
    occurredAt,
    projectId: FLOW,
    projectKind: 'flow',
    title: 'Como editar 10x mais rápido',
    source: 'auto',
    createdAt: occurredAt,
  });
}

const RANGE = 'from=2026-11-01T03:00:00.000Z&to=2026-12-01T03:00:00.000Z';

describe('GET /events', () => {
  it('exige o token de login e passa o token para o banco', async () => {
    const { app, call, tokens } = setup();
    const response = await app.request(`/events?${RANGE}`);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Entre na sua conta para continuar.' });
    expect((await call(`/events?${RANGE}`)).status).toBe(200);
    expect(tokens).toEqual([TOKEN]);
  });

  it('lista só o intervalo pedido (começo incluído, fim excluído), em ordem', async () => {
    const { call, json, store } = setup();
    for (const [n, at] of [
      [1, '2026-11-12T17:32:00.000Z'],
      [2, '2026-11-01T03:00:00.000Z'],
      [3, '2026-12-01T03:00:00.000Z'],
      [4, '2026-10-31T23:00:00.000Z'],
    ] as const) {
      const event = autoEvent(n, at);
      store.events.set(event.id, event);
    }
    const events = await json<AgendaEvent[]>(await call(`/events?${RANGE}`));
    expect(events.map((e) => eventSchema.parse(e).occurredAt)).toEqual([
      '2026-11-01T03:00:00.000Z',
      '2026-11-12T17:32:00.000Z',
    ]);
  });

  it('aceita o fuso na data (o + vai codificado)', async () => {
    const { call, json } = setup();
    const from = encodeURIComponent('2026-11-01T00:00:00-03:00');
    const to = encodeURIComponent('2026-12-01T00:00:00-03:00');
    expect(await json<unknown[]>(await call(`/events?from=${from}&to=${to}`))).toEqual([]);
  });

  it('recusa intervalo ausente, invertido ou grande demais', async () => {
    const { call, json } = setup();
    for (const query of [
      '',
      'from=2026-11-01T00:00:00Z',
      'from=2026-12-01T00:00:00Z&to=2026-11-01T00:00:00Z',
      'from=2026-11-01&to=2026-12-01',
      'from=2020-01-01T00:00:00Z&to=2026-12-01T00:00:00Z',
    ]) {
      const response = await call(`/events?${query}`);
      expect(response.status, query).toBe(400);
      expect((await json<{ error: string }>(response)).error).toMatch(/from/);
    }
  });
});

describe('POST /events (anotação à mão)', () => {
  it('cria uma anotação de agora e devolve o evento', async () => {
    const { post, store } = setup();
    const before = Date.now();
    const response = await post('/events', { title: '  Ideia do jogo  ' });
    expect(response.status).toBe(201);
    const event = eventSchema.parse(await response.json());
    expect(event).toMatchObject({
      type: 'note',
      source: 'manual',
      title: 'Ideia do jogo',
      projectId: null,
    });
    expect(new Date(event.occurredAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(store.events.size).toBe(1);
  });

  it('aceita data no passado e um projeto da pessoa', async () => {
    const { post } = setup();
    const response = await post('/events', {
      title: 'Gravei o episódio 11',
      detail: 'Sem cortes',
      occurredAt: '2025-03-04T10:00:00-03:00',
      projectId: FLOW,
    });
    expect(response.status).toBe(201);
    expect(eventSchema.parse(await response.json())).toMatchObject({
      occurredAt: '2025-03-04T10:00:00-03:00',
      detail: 'Sem cortes',
      projectId: FLOW,
      projectKind: 'flow',
    });
  });

  it('recusa data no futuro, título vazio, corpo quebrado e tipo escolhido à mão', async () => {
    const { post, call, store } = setup();
    const future = await post('/events', { title: 'Amanhã', occurredAt: '2999-01-01T00:00:00Z' });
    expect(future.status).toBe(400);
    expect(await future.json()).toEqual({ error: 'A data da anotação não pode ser no futuro.' });
    expect((await post('/events', { title: '   ' })).status).toBe(400);
    expect((await post('/events', {})).status).toBe(400);
    expect((await call('/events', { method: 'POST', body: '{não é json' })).status).toBe(400);
    expect(store.events.size).toBe(0);

    // `type` e `source` do corpo são ignorados: anotação é sempre manual.
    const forged = await post('/events', { title: 'Forjado', type: 'completed', source: 'auto' });
    expect(eventSchema.parse(await forged.json())).toMatchObject({
      type: 'note',
      source: 'manual',
    });
  });

  it('projeto que não existe para a pessoa é 404', async () => {
    const { post } = setup();
    const response = await post('/events', {
      title: 'No projeto de outra pessoa',
      projectId: '99999999-9999-4999-8999-999999999999',
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Projeto não encontrado.' });
  });
});

describe('DELETE /events/:id', () => {
  it('apaga anotação, mas não evento automático', async () => {
    const { post, call, store } = setup();
    const note = eventSchema.parse(await (await post('/events', { title: 'Anotei' })).json());
    const auto = autoEvent(1, '2026-11-12T17:32:00.000Z');
    store.events.set(auto.id, auto);

    const forbidden = await call(`/events/${auto.id}`, { method: 'DELETE' });
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({
      error: 'Só anotações feitas à mão podem ser apagadas.',
    });
    expect(store.events.has(auto.id)).toBe(true);

    expect((await call(`/events/${note.id}`, { method: 'DELETE' })).status).toBe(204);
    expect(store.events.has(note.id)).toBe(false);
    expect((await call(`/events/${note.id}`, { method: 'DELETE' })).status).toBe(404);
  });

  it('id que não é uuid é 404', async () => {
    const { call } = setup();
    expect((await call('/events/nao-e-uuid', { method: 'DELETE' })).status).toBe(404);
  });
});

describe('aulas de um caderno', () => {
  it('cria, lista, atualiza e apaga', async () => {
    const { post, patch, call, json } = setup();
    const base = `/notebooks/${NOTEBOOK}/lessons`;

    const first = await post(base, { title: '  Atalhos de corte  ' });
    expect(first.status).toBe(201);
    const lesson = lessonSchema.parse(await first.json());
    expect(lesson).toMatchObject({
      notebookId: NOTEBOOK,
      title: 'Atalhos de corte',
      status: 'studying',
      position: 0,
      studiedAt: null,
    });
    const second = lessonSchema.parse(
      await (await post(base, { title: 'Correção de cor', status: 'review' })).json(),
    );
    expect(second.position).toBe(1);

    const list = await json<unknown[]>(await call(base));
    expect(list.map((item) => lessonSchema.parse(item).title)).toEqual([
      'Atalhos de corte',
      'Correção de cor',
    ]);

    const studied = await patch(`${base}/${lesson.id}`, {
      status: 'done',
      studiedAt: '2026-11-12T14:32:00-03:00',
      reviewOn: '2026-11-19',
    });
    expect(studied.status).toBe(200);
    expect(lessonSchema.parse(await studied.json())).toMatchObject({
      status: 'done',
      studiedAt: '2026-11-12T14:32:00-03:00',
      reviewOn: '2026-11-19',
      title: 'Atalhos de corte',
    });

    const cleared = lessonSchema.parse(
      await (await patch(`${base}/${lesson.id}`, { reviewOn: null })).json(),
    );
    expect(cleared.reviewOn).toBeNull();
    expect(cleared.studiedAt).toBe('2026-11-12T14:32:00-03:00');

    expect((await call(`${base}/${lesson.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await call(`${base}/${lesson.id}`, { method: 'DELETE' })).status).toBe(404);
    expect(await json<unknown[]>(await call(base))).toHaveLength(1);
  });

  it('exige o token de login', async () => {
    const { app } = setup();
    expect((await app.request(`/notebooks/${NOTEBOOK}/lessons`)).status).toBe(401);
  });

  it('caderno que não existe, ou que é de outro tipo, é 404', async () => {
    const { call, post } = setup();
    for (const id of ['99999999-9999-4999-8999-999999999999', FLOW, 'nao-e-uuid']) {
      expect((await call(`/notebooks/${id}/lessons`)).status, id).toBe(404);
      expect((await post(`/notebooks/${id}/lessons`, { title: 'x' })).status, id).toBe(404);
    }
  });

  it('recusa dados inválidos', async () => {
    const { post, patch, call, json } = setup();
    const base = `/notebooks/${NOTEBOOK}/lessons`;
    for (const body of [
      {},
      { title: ' ' },
      { title: 'a', status: 'pausada' },
      { title: 'a', reviewOn: '19/11' },
    ]) {
      expect((await post(base, body)).status, JSON.stringify(body)).toBe(400);
    }
    const { id } = lessonSchema.parse(await (await post(base, { title: 'Aula' })).json());
    for (const body of [{}, { title: '' }, { studiedAt: '2026-11-12' }, { position: -1 }]) {
      expect((await patch(`${base}/${id}`, body)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await call(base, { method: 'POST', body: '{não é json' })).status).toBe(400);
    expect((await json<{ error: string }[]>(await call(base))).length).toBe(1);
  });

  it('aula de outro caderno ou que não existe é 404', async () => {
    const { patch, post, store } = setup();
    const other = '55555555-5555-4555-8555-555555555555';
    store.projects.set(other, 'notebook');
    const { id } = lessonSchema.parse(
      await (await post(`/notebooks/${NOTEBOOK}/lessons`, { title: 'Aula' })).json(),
    );
    expect((await patch(`/notebooks/${other}/lessons/${id}`, { title: 'x' })).status).toBe(404);
    expect(
      (
        await patch(`/notebooks/${NOTEBOOK}/lessons/99999999-9999-4999-8999-999999999999`, {
          title: 'x',
        })
      ).status,
    ).toBe(404);
    expect((await patch(`/notebooks/${NOTEBOOK}/lessons/nao-e-uuid`, { title: 'x' })).status).toBe(
      404,
    );
  });
});

describe('sessão', () => {
  it('token vencido vira 401 com a mensagem em português', async () => {
    const store: OrganizationStore = {
      ...createMemoryOrganizationStore(),
      list: () => Promise.reject(new SessionError()),
    };
    const app = createApp(
      () => createMemoryStore(),
      () => store,
    );
    const response = await app.request(`/events?${RANGE}`, {
      headers: { Authorization: 'Bearer vencido' },
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: 'Sua sessão acabou. Entre de novo para continuar.',
    });
  });
});

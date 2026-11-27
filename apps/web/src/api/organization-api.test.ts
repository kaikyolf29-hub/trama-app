import { describe, expect, it, vi } from 'vitest';
import { createAgendaApi } from './agenda-api';
import { ApiError } from './http';
import { createLessonsApi } from './lessons-api';

const event = {
  id: '00000000-0000-4000-8000-000000000001',
  type: 'created',
  occurredAt: '2026-11-12T17:32:00.000Z',
  projectId: '6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f',
  projectKind: 'flow',
  lessonId: null,
  title: 'Como editar 10x mais rápido',
  detail: null,
  source: 'auto',
  createdAt: '2026-11-12T17:32:00.000Z',
};

const lesson = {
  id: '00000000-0000-4000-8000-000000000002',
  notebookId: '44444444-4444-4444-8444-444444444444',
  title: 'Atalhos de corte',
  notes: '',
  status: 'done',
  studiedAt: '2026-11-12T17:32:00.000Z',
  reviewedAt: null,
  reviewOn: '2026-11-19',
  position: 0,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-12T17:32:00.000Z',
};

const options = (respond: () => Promise<Response>, token: string | null = 'tok') => {
  const fetcher = vi.fn<typeof fetch>(respond);
  return {
    fetcher,
    options: {
      baseUrl: 'https://api.exemplo/',
      getToken: () => Promise.resolve(token),
      fetch: fetcher,
    },
  };
};

const json =
  (body: unknown, status = 200) =>
  () =>
    Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('cliente da Agenda', () => {
  it('lista por intervalo, com as datas codificadas, e valida os eventos', async () => {
    const { options: o, fetcher } = options(json([event]));
    const events = await createAgendaApi(o).list({
      from: '2026-11-01T00:00:00-03:00',
      to: '2026-12-01T00:00:00-03:00',
    });
    expect(events).toHaveLength(1);
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe(
      'https://api.exemplo/events?from=2026-11-01T00%3A00%3A00-03%3A00&to=2026-12-01T00%3A00%3A00-03%3A00',
    );
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer tok');
  });

  it('cria a anotação com POST e valida o evento que volta', async () => {
    const note = { ...event, type: 'note', source: 'manual', projectId: null, projectKind: null };
    const { options: o, fetcher } = options(json(note, 201));
    const created = await createAgendaApi(o).createNote({
      title: 'Ideia do jogo',
      occurredAt: '2026-11-26T09:00:00-03:00',
    });
    expect(created.type).toBe('note');
    const init = fetcher.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(typeof init?.body === 'string' && JSON.parse(init.body)).toEqual({
      title: 'Ideia do jogo',
      occurredAt: '2026-11-26T09:00:00-03:00',
    });
  });

  it('apaga com DELETE (resposta 204 sem corpo)', async () => {
    const { options: o, fetcher } = options(() =>
      Promise.resolve(new Response(null, { status: 204 })),
    );
    await createAgendaApi(o).remove('abc/1');
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.exemplo/events/abc%2F1');
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe('DELETE');
  });

  it('mostra a mensagem em português que a API mandou', async () => {
    const { options: o } = options(
      json({ error: 'Só anotações feitas à mão podem ser apagadas.' }, 403),
    );
    await expect(createAgendaApi(o).remove('x')).rejects.toMatchObject({
      message: 'Só anotações feitas à mão podem ser apagadas.',
      status: 403,
    });
  });

  it('recusa resposta fora do contrato, sem token e sem conexão', async () => {
    const bad = options(json([{ ...event, type: 'visto' }]));
    await expect(createAgendaApi(bad.options).list({ from: 'a', to: 'b' })).rejects.toMatchObject({
      status: 502,
    });

    const signedOut = options(json([]), null);
    await expect(
      createAgendaApi(signedOut.options).list({ from: 'a', to: 'b' }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(signedOut.fetcher).not.toHaveBeenCalled();

    const offline = options(() => Promise.reject(new TypeError('Failed to fetch')));
    await expect(
      createAgendaApi(offline.options).list({ from: 'a', to: 'b' }),
    ).rejects.toMatchObject({ status: 0 });
  });
});

describe('cliente das aulas', () => {
  const notebook = lesson.notebookId;

  it('lista, cria, atualiza e apaga nas rotas do caderno', async () => {
    const list = options(json([lesson]));
    expect(await createLessonsApi(list.options).list(notebook)).toHaveLength(1);
    expect(list.fetcher.mock.calls[0]?.[0]).toBe(
      `https://api.exemplo/notebooks/${notebook}/lessons`,
    );

    const create = options(json(lesson, 201));
    await createLessonsApi(create.options).create(notebook, { title: 'Atalhos de corte' });
    expect(create.fetcher.mock.calls[0]?.[1]?.method).toBe('POST');

    const update = options(json(lesson));
    const updated = await createLessonsApi(update.options).update(notebook, lesson.id, {
      studiedAt: '2026-11-12T17:32:00.000Z',
      reviewOn: null,
    });
    expect(updated.status).toBe('done');
    expect(update.fetcher.mock.calls[0]?.[0]).toBe(
      `https://api.exemplo/notebooks/${notebook}/lessons/${lesson.id}`,
    );
    expect(update.fetcher.mock.calls[0]?.[1]?.method).toBe('PATCH');

    const remove = options(() => Promise.resolve(new Response(null, { status: 204 })));
    await createLessonsApi(remove.options).remove(notebook, lesson.id);
    expect(remove.fetcher.mock.calls[0]?.[1]?.method).toBe('DELETE');
  });

  it('recusa aula fora do contrato', async () => {
    const bad = options(json([{ ...lesson, reviewOn: '19/11' }]));
    await expect(createLessonsApi(bad.options).list(notebook)).rejects.toMatchObject({
      status: 502,
    });
  });
});

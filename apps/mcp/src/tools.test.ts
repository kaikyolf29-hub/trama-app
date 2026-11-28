/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call -- o JSON de saída das ferramentas chega sem tipo; os testes o leem campo a campo */
import {
  MCP_SCOPE_READ,
  MCP_SCOPE_WRITE,
  aiOrganizeResponseSchema,
  flowContentSchema,
  mcpToolNames,
  scriptContentSchema,
} from '@trama/core';
import { describe, expect, it } from 'vitest';
import { createTramaServer } from './tools';
import { connectInMemory, isError, structuredOf, textOf } from './test/client';
import { createFakeTrama } from './test/fake-trama';

const NOW = new Date('2026-11-28T15:00:00.000Z');
const APP = 'https://trama.exemplo.workers.dev';
const ALL = [MCP_SCOPE_READ, MCP_SCOPE_WRITE];

async function setup(
  scopes: string[] = ALL,
  fakeOptions: Parameters<typeof createFakeTrama>[0] = {},
) {
  const trama = createFakeTrama({ now: () => NOW, ...fakeOptions });
  const server = createTramaServer({
    api: trama.api(),
    scopes,
    clientName: 'Claude',
    appUrl: APP,
    now: () => NOW,
  });
  const client = await connectInMemory(server);
  const call = (name: string, args: Record<string, unknown> = {}) =>
    client.callTool({ name, arguments: args });
  return { trama, client, call };
}

/** O JSON que o cliente MCP devolve não tem tipo: os testes o leem campo a campo. */
type Out = Record<string, any>;

describe('o servidor MCP do Trama', () => {
  it('anuncia as nove ferramentas do plano, sem nenhuma que apague', async () => {
    const { client } = await setup();
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([...mcpToolNames].sort());
    for (const tool of tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.annotations?.destructiveHint).toBe(false);
    }
    const read = tools.filter((tool) => tool.annotations?.readOnlyHint).map((tool) => tool.name);
    expect(read.sort()).toEqual(['buscar_agenda', 'ler_fluxo', 'listar_projetos']);
  });
});

describe('criar_fluxo', () => {
  it('cria um fluxo que o quadro abre, devolve os ids e deixa uma anotação na Agenda', async () => {
    const { trama, call } = await setup();
    const result = await call('criar_fluxo', {
      title: 'Plano do vídeo',
      blocks: [
        { type: 'card', ref: 'a', title: 'Roteiro' },
        { type: 'card', ref: 'b', title: 'Gravar' },
      ],
      links: [{ from: 'a', to: 'b', label: 'depois' }],
    });
    expect(isError(result)).toBe(false);
    const out = structuredOf<Out>(result);
    expect(out.counts).toEqual({ blocks: 2, frames: 0, arrows: 1 });
    expect(out.project.url).toBe(`${APP}/p/${out.project.id}`);
    expect(Object.keys(out.refs).sort()).toEqual(['a', 'b']);

    const stored = trama.projects.get(out.project.id)!;
    expect(stored.title).toBe('Plano do vídeo');
    expect(flowContentSchema.safeParse(stored.content).success).toBe(true);

    const notes = trama.events.filter((event) => event.type === 'note');
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      title: 'Fluxo criado: Plano do vídeo',
      detail: 'Pelo conector Claude',
      projectId: out.project.id,
      source: 'manual',
    });
  });

  it('uma entrada errada vira uma frase para a IA corrigir, sem criar nada', async () => {
    const { trama, call } = await setup();
    const result = await call('criar_fluxo', {
      blocks: [{ type: 'card', ref: 'a', title: 'A' }],
      links: [{ from: 'a', to: 'nao-existe' }],
    });
    expect(isError(result)).toBe(true);
    expect(textOf(result)).toMatch(/não é um bloco novo/);
    expect(trama.projects.size).toBe(0);
  });

  it('a validação do core recusa antes de chegar na ferramenta', async () => {
    const { trama, call } = await setup();
    const result = await call('criar_fluxo', { blocks: [] });
    expect(isError(result)).toBe(true);
    expect(trama.projects.size).toBe(0);
  });

  it('se a anotação da Agenda falhar, o fluxo já criado continua valendo', async () => {
    const { trama, call } = await setup();
    trama.failNotes(true);
    const result = await call('criar_fluxo', { blocks: [{ type: 'sticky', text: 'x' }] });
    expect(isError(result)).toBe(false);
    expect(trama.projects.size).toBe(1);
  });
});

describe('adicionar_blocos e ler_fluxo', () => {
  async function withFlow() {
    const ctx = await setup();
    const created = structuredOf<Out>(
      await ctx.call('criar_fluxo', {
        title: 'Base',
        blocks: [
          { type: 'card', ref: 'a', title: 'A' },
          { type: 'card', ref: 'b', title: 'B' },
        ],
        links: [{ from: 'a', to: 'b' }],
      }),
    );
    return {
      ...ctx,
      id: created.project.id as string,
      refs: created.refs as Record<string, string>,
    };
  }

  it('ler_fluxo devolve o fluxo inteiro, ou um resumo com os ids', async () => {
    const { call, id, refs } = await withFlow();
    const full = structuredOf<Out>(await call('ler_fluxo', { projectId: id }));
    expect(full.content.blocks).toHaveLength(2);
    expect(full.summary).toBeUndefined();
    const summary = structuredOf<Out>(
      await call('ler_fluxo', { projectId: id, format: 'summary' }),
    );
    expect(summary.content).toBeUndefined();
    expect(summary.summary.blocks.map((block: { id: string }) => block.id).sort()).toEqual(
      Object.values(refs).sort(),
    );
  });

  it('adiciona embaixo, liga ao que já existia, sobe a revisão e registra', async () => {
    const { trama, call, id, refs } = await withFlow();
    const result = await call('adicionar_blocos', {
      projectId: id,
      blocks: [{ type: 'card', ref: 'c', title: 'C' }],
      links: [{ from: refs.b, to: 'c' }],
    });
    expect(isError(result)).toBe(false);
    const out = structuredOf<Out>(result);
    expect(out.added).toEqual({ blocks: 1, frames: 0, arrows: 1 });
    expect(out.project.revision).toBe(2);
    const stored = flowContentSchema.parse(trama.projects.get(id)!.content);
    expect(stored.blocks).toHaveLength(3);
    expect(stored.arrows).toHaveLength(2);
    expect(trama.events.filter((event) => event.type === 'note').at(-1)?.title).toBe(
      'Blocos adicionados: Base',
    );
  });

  it('recusa projeto que não é fluxo, que não existe, e entrada com id errado', async () => {
    const { trama, call, id } = await withFlow();
    const notebook = structuredOf<Out>(
      await call('registrar_estudo', { notebookTitle: 'Inglês', title: 'Aula 1' }),
    );
    const notFlow = await call('ler_fluxo', { projectId: notebook.notebook.id });
    expect(isError(notFlow)).toBe(true);
    expect(textOf(notFlow)).toMatch(/caderno, não um fluxo/);
    const missing = await call('ler_fluxo', { projectId: crypto.randomUUID() });
    expect(isError(missing)).toBe(true);
    expect(textOf(missing)).toBe('Projeto não encontrado.');
    const before = trama.writes.length;
    const bad = await call('adicionar_blocos', {
      projectId: id,
      links: [{ from: 'x', to: 'y' }],
    });
    expect(isError(bad)).toBe(true);
    expect(trama.writes.length).toBe(before);
  });
});

describe('marcar_concluido', () => {
  it('marca o selo de um cartão e registra na Agenda', async () => {
    const { trama, call } = await setup();
    const created = structuredOf<Out>(
      await call('criar_fluxo', { blocks: [{ type: 'card', ref: 'v', title: 'Vídeo' }] }),
    );
    const result = await call('marcar_concluido', {
      projectId: created.project.id,
      blockId: created.refs.v,
    });
    expect(isError(result)).toBe(false);
    expect(structuredOf<Out>(result)).toMatchObject({ label: 'Vídeo pronto', done: true });
    const stored = flowContentSchema.parse(trama.projects.get(created.project.id)!.content);
    const card = stored.blocks[0];
    expect(card?.type === 'card' && card.status).toMatchObject({
      done: true,
      doneAt: NOW.toISOString(),
    });
    expect(trama.events.at(-1)?.title).toContain('Vídeo pronto');
  });

  it('sem bloco, marca o projeto como concluído (o banco registra o evento)', async () => {
    const { trama, call } = await setup();
    const created = structuredOf<Out>(
      await call('criar_fluxo', { title: 'Meu vídeo', blocks: [{ type: 'sticky', text: 'x' }] }),
    );
    const out = structuredOf<Out>(
      await call('marcar_concluido', { projectId: created.project.id }),
    );
    expect(out.status).toBe('done');
    expect(trama.projects.get(created.project.id)?.status).toBe('done');
    expect(trama.events.some((event) => event.type === 'completed')).toBe(true);
  });

  it('marca uma etapa da lista', async () => {
    const { trama, call } = await setup();
    const created = structuredOf<Out>(
      await call('criar_fluxo', {
        blocks: [{ type: 'checklist', ref: 'l', items: ['Ensaiar', 'Gravar'] }],
      }),
    );
    const flow = structuredOf<Out>(await call('ler_fluxo', { projectId: created.project.id }));
    const itemId = flow.content.blocks[0].items[1].id as string;
    await call('marcar_concluido', {
      projectId: created.project.id,
      blockId: created.refs.l,
      itemId,
    });
    const stored = flowContentSchema.parse(trama.projects.get(created.project.id)!.content);
    const list = stored.blocks[0];
    expect(list?.type === 'checklist' && list.items.map((item) => item.done)).toEqual([
      false,
      true,
    ]);
  });

  it('bloco que não existe vira frase de erro', async () => {
    const { call } = await setup();
    const created = structuredOf<Out>(
      await call('criar_fluxo', { blocks: [{ type: 'sticky', text: 'x' }] }),
    );
    const result = await call('marcar_concluido', { projectId: created.project.id, blockId: 'xx' });
    expect(isError(result)).toBe(true);
    expect(textOf(result)).toMatch(/Não achei o bloco/);
  });
});

describe('criar_roteiro', () => {
  it('cria o roteiro e o fluxo ligados', async () => {
    const { trama, call } = await setup();
    const result = await call('criar_roteiro', {
      title: 'Como editar mais rápido',
      targetDuration: '8–10 min',
      scenes: [
        { title: 'Gancho', narration: 'Você perde horas?', broll: ['tela'] },
        { title: 'Atalhos' },
      ],
    });
    expect(isError(result)).toBe(false);
    const out = structuredOf<Out>(result);
    expect(out.scenes).toBe(2);
    const script = trama.projects.get(out.script.id)!;
    const flow = trama.projects.get(out.flow.id)!;
    expect(script.kind).toBe('script');
    expect(flow.kind).toBe('flow');
    const content = scriptContentSchema.parse(script.content);
    expect(content.flowId).toBe(flow.id);
    expect(content.scenes.every((scene) => scene.cardId !== undefined)).toBe(true);
    const cards = flowContentSchema.parse(flow.content).blocks.map((block) => block.id);
    for (const scene of content.scenes) expect(cards).toContain(scene.cardId);
    expect(trama.events.at(-1)?.title).toBe('Roteiro criado: Como editar mais rápido');
  });

  it('sem ligar fluxo, só o roteiro', async () => {
    const { trama, call } = await setup();
    const out = structuredOf<Out>(
      await call('criar_roteiro', {
        title: 'Só texto',
        linkFlow: false,
        scenes: [{ title: 'Um' }],
      }),
    );
    expect(out.flow).toBeNull();
    expect(trama.projects.size).toBe(1);
    expect(scriptContentSchema.parse([...trama.projects.values()][0]!.content).flowId).toBeNull();
  });
});

describe('registrar_estudo', () => {
  it('cria o caderno que não existe e a aula, com estudo e revisão', async () => {
    const { trama, call } = await setup();
    const result = await call('registrar_estudo', {
      notebookTitle: 'Inglês',
      title: 'Past simple',
      notes: 'verbos regulares',
    });
    expect(isError(result)).toBe(false);
    const out = structuredOf<Out>(result);
    expect(out.notebookCreated).toBe(true);
    expect(out.lesson).toMatchObject({
      title: 'Past simple',
      status: 'done',
      studiedAt: NOW.toISOString(),
      reviewOn: '2026-12-05',
    });
    expect(trama.events.some((event) => event.type === 'studied')).toBe(true);
  });

  it('usa o caderno que já existe pelo nome (sem acento ou maiúscula) e o intervalo dele', async () => {
    const { trama, call } = await setup();
    const id = crypto.randomUUID();
    trama.seed({
      id,
      kind: 'notebook',
      title: 'Inglês',
      status: 'draft',
      revision: 1,
      content: { schemaVersion: 1, reviewAfterDays: 3 },
    });
    const out = structuredOf<Out>(
      await call('registrar_estudo', { notebookTitle: 'inglês', title: 'Aula 2' }),
    );
    expect(out.notebookCreated).toBe(false);
    expect(out.notebook.id).toBe(id);
    expect(out.lesson.reviewOn).toBe('2026-12-01');
    expect(trama.projects.size).toBe(1);
  });

  it('recusa id que não é caderno e estudo no futuro', async () => {
    const { trama, call } = await setup();
    const flowId = crypto.randomUUID();
    trama.seed({ id: flowId, kind: 'flow', title: 'F', status: 'draft', revision: 1, content: {} });
    const notNotebook = await call('registrar_estudo', { notebookId: flowId, title: 'x' });
    expect(isError(notNotebook)).toBe(true);
    expect(textOf(notNotebook)).toMatch(/não é um caderno/);
    const future = await call('registrar_estudo', {
      notebookTitle: 'Inglês',
      title: 'x',
      studiedAt: '2026-12-31T12:00:00Z',
    });
    expect(isError(future)).toBe(true);
    expect(textOf(future)).toMatch(/futuro/);
    expect(trama.lessons).toHaveLength(0);
  });
});

describe('buscar_agenda e listar_projetos', () => {
  it('devolve o que foi feito no dia, no fuso da pessoa', async () => {
    const { call } = await setup();
    await call('criar_fluxo', { title: 'Meu vídeo', blocks: [{ type: 'sticky', text: 'x' }] });
    const out = structuredOf<Out>(await call('buscar_agenda', { period: 'day' }));
    expect(out).toMatchObject({
      period: 'day',
      from: '2026-11-28',
      to: '2026-11-28',
      timeZone: 'America/Sao_Paulo',
    });
    expect(out.days).toHaveLength(1);
    const labels = out.days[0].events.map(
      (event: { label: string; time: string }) => `${event.time} ${event.label}`,
    );
    // Os dois aconteceram no mesmo instante: a ordem entre eles não importa.
    expect([...labels].sort()).toEqual(['12:00 Anotação', '12:00 Fluxo criado']);
  });

  it('semana e mês', async () => {
    const { call } = await setup();
    const week = structuredOf<Out>(
      await call('buscar_agenda', { period: 'week', date: '2026-11-28' }),
    );
    expect([week.from, week.to]).toEqual(['2026-11-22', '2026-11-28']);
    const month = structuredOf<Out>(
      await call('buscar_agenda', { period: 'month', date: '2026-11-28' }),
    );
    expect([month.from, month.to]).toEqual(['2026-11-01', '2026-11-30']);
  });

  it('sem fuso na conta, vale o de São Paulo', async () => {
    const { call } = await setup(ALL, { timeZone: null });
    const out = structuredOf<Out>(await call('buscar_agenda', {}));
    expect(out.timeZone).toBe('America/Sao_Paulo');
  });

  it('lista com filtro, limite e o endereço de cada projeto', async () => {
    const { trama, call } = await setup();
    for (const [title, kind] of [
      ['Edição', 'flow'],
      ['Roteiro', 'script'],
      ['Inglês', 'notebook'],
    ] as const) {
      trama.seed({
        id: crypto.randomUUID(),
        kind,
        title,
        status: 'draft',
        revision: 1,
        content: {},
      });
    }
    const all = structuredOf<Out>(await call('listar_projetos'));
    expect(all.total).toBe(3);
    expect(all.projects[0].url).toMatch(/\/p\//);
    const flows = structuredOf<Out>(await call('listar_projetos', { kind: 'flow' }));
    expect(flows.projects.map((project: { title: string }) => project.title)).toEqual(['Edição']);
    const limited = structuredOf<Out>(await call('listar_projetos', { limit: 1 }));
    expect([limited.total, limited.projects.length]).toEqual([3, 1]);
  });
});

describe('organizar_texto', () => {
  const organize = aiOrganizeResponseSchema.parse({
    format: 'flow',
    provider: 'anthropic',
    model: 'claude-haiku-5-5',
    usage: { inputTokens: 10, outputTokens: 20 },
    output: {
      title: 'Plano de gravação',
      blocks: [
        { type: 'card', ref: 'b1', title: 'Roteiro', description: null, tag: null },
        { type: 'card', ref: 'b2', title: 'Gravar', description: null, tag: null },
      ],
      groups: [],
      links: [{ from: 'b1', to: 'b2', label: null }],
      corrections: [],
    },
  });

  it('devolve o resultado da IA sem criar projeto, e registra o uso', async () => {
    const { trama, call } = await setup(ALL, { organize });
    const out = structuredOf<Out>(
      await call('organizar_texto', { text: 'primeiro roteiro, depois gravar', format: 'flow' }),
    );
    expect(out.project).toBeNull();
    expect(out.result.format).toBe('flow');
    expect(trama.projects.size).toBe(0);
    expect(trama.events.at(-1)?.title).toBe('Texto organizado: Plano de gravação');
  });

  it('com saveAsFlow, cria o fluxo com o título sugerido', async () => {
    const { trama, call } = await setup(ALL, { organize });
    const out = structuredOf<Out>(
      await call('organizar_texto', { text: 'x', format: 'flow', saveAsFlow: true }),
    );
    expect(out.project.title).toBe('Plano de gravação');
    const stored = flowContentSchema.parse(trama.projects.get(out.project.id)!.content);
    expect(stored.arrows).toHaveLength(1);
  });

  it('prompt não vira fluxo, e nem chama a IA', async () => {
    const { trama, call } = await setup(ALL, { organize });
    const result = await call('organizar_texto', { text: 'x', format: 'prompt', saveAsFlow: true });
    expect(isError(result)).toBe(true);
    expect(trama.writes).not.toContain('organize');
  });

  it('sem IA configurada, a frase da API chega à pessoa', async () => {
    const { call } = await setup();
    const result = await call('organizar_texto', { text: 'x', format: 'flow' });
    expect(isError(result)).toBe(true);
    expect(textOf(result)).toBe('Escolha a IA em Configurações antes.');
  });
});

describe('permissões: leitura nunca escreve', () => {
  const writeCalls: [string, Record<string, unknown>][] = [
    ['criar_fluxo', { blocks: [{ type: 'sticky', text: 'x' }] }],
    [
      'adicionar_blocos',
      { projectId: crypto.randomUUID(), blocks: [{ type: 'sticky', text: 'x' }] },
    ],
    ['marcar_concluido', { projectId: crypto.randomUUID() }],
    ['organizar_texto', { text: 'x', format: 'flow' }],
    ['criar_roteiro', { title: 'x', scenes: [{ title: 'y' }] }],
    ['registrar_estudo', { notebookTitle: 'x', title: 'y' }],
  ];

  it.each(writeCalls)('%s é recusada só com a leitura, sem tocar em nada', async (name, args) => {
    const { trama, call } = await setup([MCP_SCOPE_READ]);
    const result = await call(name, args);
    expect(isError(result)).toBe(true);
    expect(textOf(result)).toMatch(/permissão de leitura/);
    expect(trama.writes).toEqual([]);
    expect(trama.projects.size).toBe(0);
    expect(trama.events).toHaveLength(0);
  });

  it('as ferramentas de leitura funcionam só com a leitura', async () => {
    const { call } = await setup([MCP_SCOPE_READ]);
    expect(isError(await call('listar_projetos'))).toBe(false);
    expect(isError(await call('buscar_agenda'))).toBe(false);
  });

  it('a escrita sozinha, sem leitura, não vale', async () => {
    const { call } = await setup([MCP_SCOPE_WRITE]);
    expect(isError(await call('listar_projetos'))).toBe(true);
  });
});

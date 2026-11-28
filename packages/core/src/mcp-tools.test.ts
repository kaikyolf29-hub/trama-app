import { describe, expect, it } from 'vitest';
import { eventSchema } from './agenda';
import { aiOrganizeResponseSchema } from './ai';
import { createLessonRequestSchema } from './api-organization';
import { projectSummarySchema, type ProjectSummary } from './api';
import { flowContentSchema, type FlowContent } from './flow';
import {
  McpInputError,
  addBlocksInputSchema,
  agendaInputSchema,
  agendaOutputSchema,
  agendaWindow,
  appendToFlow,
  buildFlowFromMcp,
  buildLessonRequest,
  buildScriptWithFlow,
  createFlowInputSchema,
  createScriptInputSchema,
  filterProjects,
  listProjectsInputSchema,
  markDoneInFlow,
  mcpFlowSummarySchema,
  organizeInputSchema,
  organizedToFlow,
  projectUrl,
  studyInputSchema,
  summarizeAgenda,
  summarizeFlow,
} from './mcp-tools';
import { scriptContentSchema } from './script';

function counter(prefix = 'id') {
  let n = 0;
  return () => `${prefix}-${String(++n)}`;
}

const create = (input: unknown) => createFlowInputSchema.parse(input);

describe('criar_fluxo', () => {
  const input = create({
    title: 'Plano do vídeo',
    blocks: [
      { type: 'card', ref: 'roteiro', title: 'Roteiro', tag: 'Passo 1' },
      { type: 'card', ref: 'gravar', title: 'Gravar', description: 'Câmera e áudio' },
      { type: 'checklist', ref: 'etapas', title: 'Etapas', items: ['Ensaiar', 'Gravar', 'Editar'] },
      { type: 'sticky', text: 'Lembrar do gancho' },
      { type: 'text', text: 'Como vai ser', style: 'title' },
      { type: 'shape', text: 'Publicar' },
    ],
    groups: [{ ref: 'g', title: 'Produção', blockRefs: ['gravar', 'etapas'] }],
    links: [
      { from: 'roteiro', to: 'gravar', label: 'depois' },
      { from: 'gravar', to: 'g' },
    ],
  });

  it('o que sai é um fluxo que o quadro abre (o esquema do core aceita)', () => {
    const { content } = buildFlowFromMcp(input, { newId: counter() });
    expect(flowContentSchema.safeParse(content).success).toBe(true);
    expect(content.blocks).toHaveLength(6);
    expect(content.frames).toHaveLength(1);
    expect(content.arrows).toHaveLength(2);
    expect(content.arrows[0]?.label).toBe('depois');
  });

  it('devolve o id de cada nome, e as setas usam esses ids', () => {
    const { content, refs } = buildFlowFromMcp(input, { newId: counter() });
    expect(refs.roteiro).toBeTruthy();
    expect(refs.g).toBe(content.frames[0]?.id);
    expect(content.arrows[0]?.from.nodeId).toBe(refs.roteiro);
    expect(content.arrows[1]?.to.nodeId).toBe(refs.g);
    // Os blocos sem nome ganham um nome automático.
    expect(Object.keys(refs)).toContain('bloco-1');
  });

  it('os blocos dentro do grupo ficam dentro da moldura', () => {
    const { content, refs } = buildFlowFromMcp(input, { newId: counter() });
    const gravar = content.blocks.find((block) => block.id === refs.gravar);
    expect(gravar?.frameId).toBe(refs.g);
  });

  it('as etapas começam desmarcadas', () => {
    const { content, refs } = buildFlowFromMcp(input, { newId: counter() });
    const list = content.blocks.find((block) => block.id === refs.etapas);
    expect(list?.type === 'checklist' && list.items.every((item) => !item.done)).toBe(true);
  });

  it('recusa nome repetido, grupo com bloco inexistente, seta para o nada e bloco em dois grupos', () => {
    const dup = create({
      blocks: [
        { type: 'sticky', ref: 'a', text: 'x' },
        { type: 'sticky', ref: 'a', text: 'y' },
      ],
    });
    expect(() => buildFlowFromMcp(dup)).toThrow(McpInputError);
    const badGroup = create({
      blocks: [{ type: 'sticky', ref: 'a', text: 'x' }],
      groups: [{ ref: 'g', title: 'G', blockRefs: ['zzz'] }],
    });
    expect(() => buildFlowFromMcp(badGroup)).toThrow(/não existe/);
    const badLink = create({
      blocks: [{ type: 'sticky', ref: 'a', text: 'x' }],
      links: [{ from: 'a', to: 'zzz' }],
    });
    expect(() => buildFlowFromMcp(badLink)).toThrow(/não é um bloco novo/);
    const twoGroups = create({
      blocks: [{ type: 'sticky', ref: 'a', text: 'x' }],
      groups: [
        { ref: 'g1', title: 'G1', blockRefs: ['a'] },
        { ref: 'g2', title: 'G2', blockRefs: ['a'] },
      ],
    });
    expect(() => buildFlowFromMcp(twoGroups)).toThrow(/mais de um grupo/);
  });

  it('um nome escolhido não colide com os nomes automáticos', () => {
    const { refs } = buildFlowFromMcp(
      create({
        blocks: [
          { type: 'sticky', text: 'sem nome' },
          { type: 'sticky', ref: 'bloco-1', text: 'com nome' },
        ],
      }),
    );
    expect(Object.keys(refs).sort()).toEqual(['bloco-1', 'bloco-2']);
  });

  it('exige ao menos um bloco e respeita os limites', () => {
    expect(createFlowInputSchema.safeParse({ title: 'x', blocks: [] }).success).toBe(false);
    expect(
      createFlowInputSchema.safeParse({
        blocks: Array.from({ length: 81 }, () => ({ type: 'sticky', text: 'x' })),
      }).success,
    ).toBe(false);
    expect(createFlowInputSchema.safeParse({ blocks: [{ type: 'card', title: '' }] }).success).toBe(
      false,
    );
    expect(createFlowInputSchema.parse({ blocks: [{ type: 'sticky', text: 'x' }] }).title).toBe(
      'Sem título',
    );
  });
});

describe('adicionar_blocos', () => {
  const base = buildFlowFromMcp(
    create({
      blocks: [
        { type: 'card', ref: 'a', title: 'A' },
        { type: 'card', ref: 'b', title: 'B' },
      ],
      links: [{ from: 'a', to: 'b' }],
    }),
    { newId: counter('base') },
  );
  const add = (input: object) =>
    addBlocksInputSchema.parse({ projectId: crypto.randomUUID(), ...input });

  it('entra embaixo do que já existe, sem mexer no resto', () => {
    const before = structuredClone(base.content);
    const out = appendToFlow(
      base.content,
      add({ blocks: [{ type: 'card', ref: 'c', title: 'C' }] }),
      { newId: counter('novo') },
    );
    expect(base.content).toEqual(before);
    expect(out.content.blocks).toHaveLength(3);
    expect(out.content.blocks.slice(0, 2)).toEqual(before.blocks);
    const bottom = Math.max(...before.blocks.map((block) => block.position.y + block.size.height));
    const c = out.content.blocks.find((block) => block.id === out.refs.c);
    expect(c?.position.y).toBeGreaterThanOrEqual(bottom + 64);
    expect(c!.position.y % 8).toBe(0);
    expect(c!.position.x % 8).toBe(0);
    expect(out.added).toEqual({ blocks: 1, frames: 0, arrows: 0 });
  });

  it('liga um bloco novo a um que já estava no quadro', () => {
    const existing = base.refs.b!;
    const out = appendToFlow(
      base.content,
      add({
        blocks: [{ type: 'card', ref: 'c', title: 'C' }],
        links: [{ from: existing, to: 'c', label: 'e então' }],
      }),
      { newId: counter('novo') },
    );
    expect(out.added.arrows).toBe(1);
    const arrow = out.content.arrows.at(-1);
    expect(arrow?.from.nodeId).toBe(existing);
    expect(arrow?.to.nodeId).toBe(out.refs.c);
    expect(flowContentSchema.safeParse(out.content).success).toBe(true);
  });

  it('só setas entre blocos que já existem; seta repetida não entra de novo', () => {
    const repeated = appendToFlow(
      base.content,
      add({ links: [{ from: base.refs.a!, to: base.refs.b! }] }),
      { newId: counter('novo') },
    );
    expect(repeated.added).toEqual({ blocks: 0, frames: 0, arrows: 0 });
    const reverse = appendToFlow(
      base.content,
      add({ links: [{ from: base.refs.b!, to: base.refs.a! }] }),
      { newId: counter('novo2') },
    );
    expect(reverse.added.arrows).toBe(1);
  });

  it('recusa seta para um id que não existe e nome igual a um id do fluxo', () => {
    expect(() =>
      appendToFlow(
        base.content,
        add({
          blocks: [{ type: 'sticky', ref: 'x', text: 't' }],
          links: [{ from: 'x', to: 'nao-existe' }],
        }),
      ),
    ).toThrow(McpInputError);
    expect(() =>
      appendToFlow(
        base.content,
        add({ blocks: [{ type: 'sticky', ref: base.refs.a!, text: 't' }] }),
      ),
    ).toThrow(/id de algo que já está/);
  });

  it('em um fluxo vazio começa na origem', () => {
    const empty = flowContentSchema.parse({ schemaVersion: 1 });
    const out = appendToFlow(empty, add({ blocks: [{ type: 'sticky', ref: 'x', text: 't' }] }), {
      newId: counter(),
    });
    expect(out.content.blocks[0]?.position).toEqual({ x: 0, y: 0 });
  });

  it('um grupo novo vira moldura embaixo das existentes', () => {
    const out = appendToFlow(
      base.content,
      add({
        blocks: [{ type: 'sticky', ref: 'x', text: 't' }],
        groups: [{ ref: 'g', title: 'Novo', blockRefs: ['x'] }],
      }),
      { newId: counter('novo') },
    );
    expect(out.added.frames).toBe(1);
    const bottom = Math.max(
      ...base.content.blocks.map((block) => block.position.y + block.size.height),
    );
    expect(out.content.frames[0]?.position.y).toBeGreaterThanOrEqual(bottom);
  });

  it('exige blocos ou setas, e um id de projeto válido', () => {
    expect(addBlocksInputSchema.safeParse({ projectId: crypto.randomUUID() }).success).toBe(false);
    expect(
      addBlocksInputSchema.safeParse({
        projectId: 'nao-e-uuid',
        blocks: [{ type: 'sticky', text: 'x' }],
      }).success,
    ).toBe(false);
  });
});

describe('ler_fluxo (resumo)', () => {
  it('lista blocos com os ids, molduras e setas', () => {
    const { content, refs } = buildFlowFromMcp(
      create({
        blocks: [
          { type: 'card', ref: 'a', title: 'Gravar', tag: 'Passo 1' },
          { type: 'checklist', ref: 'c', title: 'Etapas', items: ['Ensaiar'] },
        ],
        groups: [{ ref: 'g', title: 'Produção', blockRefs: ['a'] }],
        links: [{ from: 'a', to: 'c', label: 'depois' }],
      }),
      { newId: counter() },
    );
    const summary = summarizeFlow(content);
    expect(mcpFlowSummarySchema.safeParse(summary).success).toBe(true);
    expect(summary.counts).toEqual({ blocks: 2, frames: 1, arrows: 1 });
    const card = summary.blocks.find((block) => block.id === refs.a);
    expect(card).toMatchObject({ type: 'card', text: 'Gravar', tag: 'Passo 1', frameId: refs.g });
    expect(summary.blocks.find((block) => block.id === refs.c)?.items?.[0]?.done).toBe(false);
    expect(summary.arrows[0]).toMatchObject({ from: refs.a, to: refs.c, label: 'depois' });
  });

  it('corta textos longos', () => {
    const flow = flowContentSchema.parse({
      schemaVersion: 1,
      blocks: [
        {
          id: 'a',
          type: 'sticky',
          position: { x: 0, y: 0 },
          size: { width: 192, height: 120 },
          text: 'x'.repeat(500),
        },
      ],
    });
    expect(summarizeFlow(flow).blocks[0]?.text.length).toBeLessThanOrEqual(120);
  });
});

describe('marcar_concluido', () => {
  const now = new Date('2026-11-28T15:00:00.000Z');
  const { content, refs } = buildFlowFromMcp(
    create({
      blocks: [
        { type: 'card', ref: 'card', title: 'Vídeo' },
        { type: 'checklist', ref: 'list', title: 'Etapas', items: ['Ensaiar', 'Gravar'] },
        { type: 'sticky', ref: 'nota', text: 'x' },
      ],
    }),
    { newId: counter() },
  );

  it('marca o selo do cartão com a hora (alimenta a Agenda)', () => {
    const out = markDoneInFlow(content, { blockId: refs.card!, done: true }, now);
    const card = out.content.blocks.find((block) => block.id === refs.card);
    expect(card?.type === 'card' && card.status).toMatchObject({
      label: 'Vídeo pronto',
      done: true,
      doneAt: now.toISOString(),
    });
    expect(out.label).toBe('Vídeo pronto');
    expect(flowContentSchema.safeParse(out.content).success).toBe(true);
  });

  it('desmarca e tira a hora', () => {
    const marked = markDoneInFlow(content, { blockId: refs.card!, done: true }, now).content;
    const out = markDoneInFlow(marked, { blockId: refs.card!, done: false }, now);
    const card = out.content.blocks.find((block) => block.id === refs.card);
    expect(card?.type === 'card' && card.status).toMatchObject({ done: false });
    expect(card?.type === 'card' && card.status?.doneAt).toBeUndefined();
  });

  it('marca uma etapa, ou todas as da lista', () => {
    const list = content.blocks.find((block) => block.id === refs.list);
    const first = list?.type === 'checklist' ? list.items[0]!.id : '';
    const one = markDoneInFlow(content, { blockId: refs.list!, itemId: first, done: true }, now);
    const afterOne = one.content.blocks.find((block) => block.id === refs.list);
    expect(afterOne?.type === 'checklist' && afterOne.items.map((item) => item.done)).toEqual([
      true,
      false,
    ]);
    expect(one.label).toBe('Ensaiar');
    const all = markDoneInFlow(content, { blockId: refs.list!, done: true }, now);
    const afterAll = all.content.blocks.find((block) => block.id === refs.list);
    expect(afterAll?.type === 'checklist' && afterAll.items.every((item) => item.done)).toBe(true);
  });

  it('não muda o fluxo original', () => {
    const before = structuredClone(content);
    markDoneInFlow(content, { blockId: refs.card!, done: true }, now);
    expect(content).toEqual(before);
  });

  it('recusa bloco que não existe, etapa que não existe e bloco que não marca', () => {
    expect(() => markDoneInFlow(content, { blockId: 'nada', done: true }, now)).toThrow(
      /Não achei o bloco/,
    );
    expect(() =>
      markDoneInFlow(content, { blockId: refs.list!, itemId: 'nada', done: true }, now),
    ).toThrow(/etapa/);
    expect(() => markDoneInFlow(content, { blockId: refs.nota!, done: true }, now)).toThrow(
      /Só cartões/,
    );
  });
});

describe('criar_roteiro', () => {
  const input = createScriptInputSchema.parse({
    title: 'Como editar mais rápido',
    targetDuration: '8–10 min',
    scenes: [
      {
        title: 'Gancho',
        time: '0:00–0:15',
        narration: 'Você perde horas editando?',
        broll: ['tela do editor'],
      },
      { title: 'Atalhos', narration: 'Três atalhos.' },
      { title: 'Exemplo' },
      { title: 'Fechamento' },
      { title: 'Chamada' },
    ],
  });

  it('cria o roteiro e o fluxo, com um cartão por cena, ligados', () => {
    const { script, flow, flowTitle } = buildScriptWithFlow(input, { newId: counter() });
    expect(scriptContentSchema.safeParse(script).success).toBe(true);
    expect(script.scenes).toHaveLength(5);
    expect(script.targetDuration).toBe('8–10 min');
    expect(flowTitle).toBe('Como editar mais rápido (fluxo)');
    expect(flow).not.toBeNull();
    expect(flowContentSchema.safeParse(flow).success).toBe(true);
    const cards = flow!.blocks.filter((block) => block.type === 'card');
    expect(cards).toHaveLength(5);
    // Cada cena aponta para o seu cartão, e o cartão leva a etiqueta "Cena N".
    script.scenes.forEach((scene, index) => {
      const card = cards.find((item) => item.id === scene.cardId);
      expect(card?.type === 'card' && card.tag).toBe(`Cena ${String(index + 1)}`);
      expect(card?.type === 'card' && card.title).toBe(scene.title);
    });
    expect(flow!.arrows).toHaveLength(4);
  });

  it('as cenas guardam fala, B-roll e tempo; a fala vira a descrição do cartão', () => {
    const { script, flow } = buildScriptWithFlow(input, { newId: counter() });
    expect(script.scenes[0]).toMatchObject({ time: '0:00–0:15', broll: ['tela do editor'] });
    const card = flow!.blocks.find((block) => block.id === script.scenes[0]?.cardId);
    expect(card?.type === 'card' && card.description).toBe('Você perde horas editando?');
  });

  it('sem ligar fluxo, as cenas ficam sem cartão', () => {
    const { script, flow } = buildScriptWithFlow(
      { ...input, linkFlow: false },
      { newId: counter() },
    );
    expect(flow).toBeNull();
    expect(script.scenes.every((scene) => scene.cardId === undefined)).toBe(true);
  });

  it('as posições ficam na grade de 8 px', () => {
    const { flow } = buildScriptWithFlow(input, { newId: counter() });
    for (const block of flow!.blocks) {
      expect(block.position.x % 8).toBe(0);
      expect(block.position.y % 8).toBe(0);
    }
  });

  it('exige ao menos uma cena', () => {
    expect(createScriptInputSchema.safeParse({ title: 'x', scenes: [] }).success).toBe(false);
  });
});

describe('registrar_estudo', () => {
  const now = new Date('2026-11-28T15:00:00.000Z');

  it('a aula nasce "Feito", com a data do estudo e a da revisão', () => {
    const request = buildLessonRequest(
      studyInputSchema.parse({ notebookTitle: 'Inglês', title: 'Past simple' }),
      { now, reviewAfterDays: 7 },
    );
    expect(createLessonRequestSchema.safeParse(request).success).toBe(true);
    expect(request).toMatchObject({
      title: 'Past simple',
      status: 'done',
      studiedAt: now.toISOString(),
      reviewOn: '2026-12-05',
    });
  });

  it('usa o intervalo do caderno e o fuso da pessoa', () => {
    const late = new Date('2026-11-28T01:30:00.000Z'); // ainda é dia 27 em São Paulo
    const request = buildLessonRequest(
      studyInputSchema.parse({ notebookId: crypto.randomUUID(), title: 'x' }),
      { now: late, reviewAfterDays: 3, timeZone: 'America/Sao_Paulo' },
    );
    expect(request.reviewOn).toBe('2026-11-30');
  });

  it('aceita estudo do passado e uma revisão marcada à mão, e recusa o futuro', () => {
    const past = buildLessonRequest(
      studyInputSchema.parse({
        notebookTitle: 'Inglês',
        title: 'x',
        notes: 'anotações',
        studiedAt: '2026-11-20T12:00:00-03:00',
        reviewOn: '2026-12-25',
      }),
      { now, reviewAfterDays: 7 },
    );
    expect(past).toMatchObject({
      notes: 'anotações',
      studiedAt: '2026-11-20T12:00:00-03:00',
      reviewOn: '2026-12-25',
    });
    expect(() =>
      buildLessonRequest(
        studyInputSchema.parse({
          notebookTitle: 'Inglês',
          title: 'x',
          studiedAt: '2026-12-31T12:00:00Z',
        }),
        { now, reviewAfterDays: 7 },
      ),
    ).toThrow(McpInputError);
  });

  it('exige o caderno', () => {
    expect(studyInputSchema.safeParse({ title: 'x' }).success).toBe(false);
    expect(studyInputSchema.safeParse({ title: 'x', notebookTitle: 'Inglês' }).success).toBe(true);
    expect(studyInputSchema.safeParse({ title: 'x', notebookId: 'nao-uuid' }).success).toBe(false);
  });
});

describe('buscar_agenda', () => {
  const now = new Date('2026-11-28T15:00:00.000Z'); // sábado
  const tz = 'America/Sao_Paulo';

  it('dia: de 00:00 a 00:00 do fuso', () => {
    const window = agendaWindow(
      agendaInputSchema.parse({ period: 'day', date: '2026-11-12' }),
      now,
      tz,
    );
    expect(window).toMatchObject({
      from: '2026-11-12T03:00:00.000Z',
      to: '2026-11-13T03:00:00.000Z',
      fromDate: '2026-11-12',
      toDate: '2026-11-12',
    });
  });

  it('sem data, hoje', () => {
    expect(agendaWindow(agendaInputSchema.parse({}), now, tz).fromDate).toBe('2026-11-28');
  });

  it('semana: de domingo a sábado', () => {
    const window = agendaWindow(
      agendaInputSchema.parse({ period: 'week', date: '2026-11-28' }),
      now,
      tz,
    );
    expect(window.fromDate).toBe('2026-11-22');
    expect(window.toDate).toBe('2026-11-28');
    expect(window.to).toBe('2026-11-29T03:00:00.000Z');
  });

  it('mês: do dia 1 ao último, inclusive em dezembro', () => {
    const nov = agendaWindow(
      agendaInputSchema.parse({ period: 'month', date: '2026-11-15' }),
      now,
      tz,
    );
    expect([nov.fromDate, nov.toDate]).toEqual(['2026-11-01', '2026-11-30']);
    const dec = agendaWindow(
      agendaInputSchema.parse({ period: 'month', date: '2026-12-31' }),
      now,
      tz,
    );
    expect([dec.fromDate, dec.toDate]).toEqual(['2026-12-01', '2026-12-31']);
  });

  it('agrupa os eventos por dia no fuso da pessoa', () => {
    const event = (n: number, occurredAt: string, extra: object = {}) =>
      eventSchema.parse({
        id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
        type: 'created',
        occurredAt,
        projectId: crypto.randomUUID(),
        projectKind: 'flow',
        title: 'Plano',
        source: 'auto',
        createdAt: occurredAt,
        ...extra,
      });
    const window = agendaWindow(
      agendaInputSchema.parse({ period: 'week', date: '2026-11-28' }),
      now,
      tz,
    );
    const out = summarizeAgenda(
      [
        event(2, '2026-11-28T02:30:00.000Z'), // 27/11 23:30 em São Paulo
        event(1, '2026-11-27T12:00:00.000Z', { type: 'completed' }),
      ],
      window,
      'week',
      tz,
    );
    expect(agendaOutputSchema.safeParse(out).success).toBe(true);
    expect(out.total).toBe(2);
    expect(out.days).toHaveLength(1);
    expect(out.days[0]?.date).toBe('2026-11-27');
    expect(out.days[0]?.events.map((item) => `${item.time} ${item.label}`)).toEqual([
      '09:00 Fluxo concluído',
      '23:30 Fluxo criado',
    ]);
  });
});

describe('listar_projetos', () => {
  const project = (
    n: number,
    kind: ProjectSummary['kind'],
    title: string,
    updatedAt: string,
    status: ProjectSummary['status'] = 'draft',
  ) =>
    projectSummarySchema.parse({
      id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
      kind,
      title,
      status,
      revision: 1,
      updatedAt,
    });
  const all = [
    project(1, 'flow', 'Edição do vídeo', '2026-11-28T15:00:00.000Z'),
    project(2, 'script', 'Roteiro do vídeo', '2026-11-20T15:00:00.000Z', 'done'),
    project(3, 'notebook', 'Inglês', '2026-11-10T15:00:00.000Z'),
    project(4, 'flow', 'Aula 1', '2026-11-01T15:00:00.000Z'),
  ];
  const run = (input: object) => filterProjects(all, listProjectsInputSchema.parse(input));

  it('sem filtro, tudo, com o padrão de 50', () => {
    expect(listProjectsInputSchema.parse({}).limit).toBe(50);
    expect(run({}).total).toBe(4);
  });

  it('filtra por tipo, status e data', () => {
    expect(run({ kind: 'flow' }).projects.map((item) => item.title)).toEqual([
      'Edição do vídeo',
      'Aula 1',
    ]);
    expect(run({ status: 'done' }).projects).toHaveLength(1);
    expect(run({ updatedFrom: '2026-11-15' }).total).toBe(2);
    expect(run({ updatedTo: '2026-11-10' }).total).toBe(2);
  });

  it('a busca ignora acento e maiúscula', () => {
    expect(run({ search: 'edicao' }).projects.map((item) => item.title)).toEqual([
      'Edição do vídeo',
    ]);
    expect(run({ search: 'INGLES' }).total).toBe(1);
  });

  it('o limite corta, mas o total conta tudo', () => {
    const out = run({ limit: 2 });
    expect(out.projects).toHaveLength(2);
    expect(out.total).toBe(4);
  });

  it('recusa limite fora da faixa', () => {
    expect(listProjectsInputSchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(listProjectsInputSchema.safeParse({ limit: 500 }).success).toBe(false);
  });
});

describe('organizar_texto', () => {
  const flowResponse = aiOrganizeResponseSchema.parse({
    format: 'flow',
    provider: 'anthropic',
    model: 'claude-haiku-5-5',
    usage: { inputTokens: 10, outputTokens: 20 },
    output: {
      title: 'Plano de gravação',
      blocks: [
        { type: 'card', ref: 'b1', title: 'Roteiro', description: null, tag: null },
        { type: 'card', ref: 'b2', title: 'Gravar', description: 'câmera', tag: 'Passo 2' },
      ],
      groups: [],
      links: [{ from: 'b1', to: 'b2', label: null }],
      corrections: [],
    },
  });

  it('vira um fluxo válido com o título sugerido', () => {
    const out = organizedToFlow(flowResponse, { newId: counter() });
    expect(out?.title).toBe('Plano de gravação');
    expect(flowContentSchema.safeParse(out?.content).success).toBe(true);
    expect(out?.content.arrows).toHaveLength(1);
  });

  it('prompt não vira fluxo', () => {
    const response = aiOrganizeResponseSchema.parse({
      format: 'prompt',
      provider: 'google',
      model: 'gemini-x',
      usage: { inputTokens: 1, outputTokens: 1 },
      output: { title: 't', sections: [{ heading: 'Objetivo', content: 'x' }], corrections: [] },
    });
    expect(organizedToFlow(response)).toBeNull();
  });

  it('o pedido é o mesmo do "Falar e organizar", com "criar fluxo" desligado por padrão', () => {
    expect(organizeInputSchema.parse({ text: 'oi', format: 'flow' }).saveAsFlow).toBe(false);
    expect(organizeInputSchema.safeParse({ text: '', format: 'flow' }).success).toBe(false);
    expect(organizeInputSchema.safeParse({ text: 'x'.repeat(20001), format: 'flow' }).success).toBe(
      false,
    );
    expect(organizeInputSchema.safeParse({ text: 'x', format: 'roteiro' }).success).toBe(false);
  });
});

describe('projectUrl', () => {
  it('monta o endereço no site', () => {
    expect(projectUrl('https://trama.exemplo.workers.dev/', 'abc')).toBe(
      'https://trama.exemplo.workers.dev/p/abc',
    );
  });
});

it('o fluxo de uma ferramenta continua válido depois de ir e voltar como JSON', () => {
  const { content } = buildFlowFromMcp(create({ blocks: [{ type: 'card', title: 'A' }] }));
  const roundTrip = JSON.parse(JSON.stringify(content)) as FlowContent;
  expect(flowContentSchema.safeParse(roundTrip).success).toBe(true);
});

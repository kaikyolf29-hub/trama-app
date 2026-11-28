import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  createEmptyFlow,
  createScene,
  flowContentSchema,
  scriptContentSchema,
  type FlowProject,
  type ScriptProject,
} from '@trama/core';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../App';
import { defaultServices } from '../../services';
import { createFakeAuth } from '../../test/fake-auth';
import { createFakeProjects } from '../../test/fake-projects';

afterEach(cleanup);

const FLOW_ID = '6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f';
const SCRIPT_ID = '7a2d3e4f-5c6b-4d8e-9f0a-1b2c3d4e5f60';
const at = '2026-11-27T10:00:00.000Z';

const flow = (content = createEmptyFlow()): FlowProject => ({
  id: FLOW_ID,
  kind: 'flow',
  title: 'Thumbnail do vídeo 12',
  status: 'draft',
  revision: 4,
  driveFileId: null,
  createdAt: at,
  updatedAt: at,
  content,
});

const script = (content: unknown = {}): ScriptProject => ({
  id: SCRIPT_ID,
  kind: 'script',
  title: 'Roteiro — Episódio 12',
  status: 'draft',
  revision: 2,
  driveFileId: null,
  createdAt: at,
  updatedAt: at,
  content: scriptContentSchema.parse(content),
});

const episode = (extra: Record<string, unknown> = {}) =>
  script({
    targetDuration: '8–10 min',
    scenes: [
      createScene({
        id: 'a',
        title: 'Gancho',
        time: '0:00–0:15',
        narration: 'Esse vídeo tinha 40 minutos.',
        notes: 'Abrir com o antes e depois',
      }),
      createScene({ id: 'b', title: 'Mostrar o problema', broll: ['Plano aberto da timeline'] }),
    ],
    ...extra,
  });

function open(projects: (FlowProject | ScriptProject)[]) {
  const fake = createFakeProjects(projects);
  const auth = createFakeAuth();
  auth.addAccount('Ana Souza', 'ana@exemplo.com', 'senha-segura-1');
  auth.signInAs('ana@exemplo.com');
  const history = createMemoryHistory({ initialEntries: [`/p/${SCRIPT_ID}`] });
  render(
    <App
      client={auth.client}
      history={history}
      services={{ ...defaultServices, projects: fake.api, autosaveDelay: 20 }}
    />,
  );
  return fake;
}

const panel = () => within(screen.getByRole('complementary', { name: 'Cenas no fluxo' }));

describe('Roteiro (tela 3)', () => {
  it('abre o roteiro com título, duração alvo, as cenas no editor e a lista "Cenas no fluxo"', async () => {
    open([episode()]);
    expect(await screen.findByRole('textbox', { name: 'Título do roteiro' })).toHaveProperty(
      'value',
      'Roteiro — Episódio 12',
    );
    expect(screen.getByRole('textbox', { name: 'Duração alvo' })).toHaveProperty(
      'value',
      '8–10 min',
    );
    const text = screen.getByRole('textbox', { name: 'Texto do roteiro' });
    expect(text.textContent).toContain('Gancho');
    expect(text.textContent).toContain('Esse vídeo tinha 40 minutos.');
    expect(text.textContent).toContain('Plano aberto da timeline');
    expect(
      (screen.getAllByRole('textbox', { name: 'Tempo da cena' })[0] as HTMLInputElement).value,
    ).toBe('0:00–0:15');
    expect(
      panel()
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(expect.arrayContaining(['Gancho · 0:00', 'Mostrar o problema', 'próxima cena']));
    expect(screen.getByRole('status', { name: '' }).textContent).toContain('Salvo');
  });

  it('a barra lateral lista os fluxos e os roteiros, com o aberto marcado', async () => {
    open([episode(), flow()]);
    await screen.findByRole('textbox', { name: 'Texto do roteiro' });
    const roteiros = await screen.findByRole('region', { name: 'Roteiros' });
    expect(within(roteiros).getByRole('link', { name: 'Roteiro — Episódio 12' })).toHaveProperty(
      'ariaCurrent',
      'page',
    );
    const fluxos = screen.getByRole('region', { name: 'Fluxos' });
    expect(within(fluxos).getByRole('link', { name: 'Thumbnail do vídeo 12' })).toBeDefined();
  });

  it('salva sozinho a duração alvo e o título, com a revisão certa', async () => {
    const fake = open([episode()]);
    fireEvent.change(await screen.findByRole('textbox', { name: 'Duração alvo' }), {
      target: { value: '12 min' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Título do roteiro' }), {
      target: { value: 'Episódio 13' },
    });
    await waitFor(() => expect(fake.scriptSaves).toHaveLength(1));
    const request = fake.scriptSaves[0]?.request;
    expect(request).toMatchObject({ baseRevision: 2, title: 'Episódio 13' });
    expect(request?.content.targetDuration).toBe('12 min');
    expect(request?.content.scenes.map((scene) => scene.title)).toEqual([
      'Gancho',
      'Mostrar o problema',
    ]);
    await waitFor(() =>
      expect(screen.getAllByRole('status').some((s) => s.textContent === 'Salvo')).toBe(true),
    );
  });

  it('"+ próxima cena" acrescenta uma cena e salva', async () => {
    const fake = open([episode()]);
    await screen.findByRole('textbox', { name: 'Texto do roteiro' });
    fireEvent.click(panel().getByRole('button', { name: /próxima cena/ }));
    await waitFor(() => expect(fake.scriptSaves).toHaveLength(1));
    expect(fake.scriptSaves[0]?.request.content.scenes).toHaveLength(3);
    expect(panel().getAllByRole('listitem')).toHaveLength(4);
  });

  it('um título em branco não é salvo: o projeto fica com o último nome', async () => {
    const fake = open([episode()]);
    const input = await screen.findByRole('textbox', { name: 'Título do roteiro' });
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.blur(input);
    expect((input as HTMLInputElement).value).toBe('Roteiro — Episódio 12');
    await new Promise((resolve) => setTimeout(resolve, 80));
    for (const { request } of fake.scriptSaves) expect(request.title).toBe('Roteiro — Episódio 12');
  });

  it('o status do roteiro muda pela API de projetos', async () => {
    const fake = open([episode()]);
    fireEvent.change(await screen.findByRole('combobox', { name: 'Status do roteiro' }), {
      target: { value: 'in_progress' },
    });
    await waitFor(() =>
      expect(fake.update).toHaveBeenCalledWith(SCRIPT_ID, { status: 'in_progress' }),
    );
  });
});

describe('Roteiro: cena ↔ cartão', () => {
  it('"Criar no quadro" cria os cartões no fluxo ligado, com a revisão certa, e liga as cenas', async () => {
    const fake = open([episode({ flowId: FLOW_ID }), flow()]);
    await screen.findByRole('textbox', { name: 'Texto do roteiro' });
    fireEvent.click(panel().getByRole('button', { name: 'Criar no quadro' }));
    expect(await screen.findByText('2 cartões criados no quadro.')).toBeDefined();

    const savedFlow = fake.saves.at(-1);
    expect(savedFlow).toMatchObject({ id: FLOW_ID, request: { baseRevision: 4 } });
    const cards = savedFlow?.request.content.blocks.filter((block) => block.type === 'card');
    expect(cards?.map((card) => [card.title, card.tag])).toEqual([
      ['Gancho', 'Cena 1'],
      ['Mostrar o problema', 'Cena 2'],
    ]);
    expect(cards?.[0]?.type === 'card' && cards[0].description).toBe(
      'Esse vídeo tinha 40 minutos.',
    );
    expect(flowContentSchema.safeParse(savedFlow?.request.content).success).toBe(true);

    // As cenas ficam ligadas e a ligação é salva logo.
    await waitFor(() => expect(fake.scriptSaves.length).toBeGreaterThan(0));
    const scenes = fake.scriptSaves.at(-1)?.request.content.scenes;
    expect(scenes?.map((scene) => scene.cardId)).toEqual(cards?.map((card) => card.id));
    expect(panel().getAllByText('No quadro')).toHaveLength(2);

    // De novo: nada a criar, e o quadro não é gravado outra vez.
    const flowSaves = fake.saves.length;
    fireEvent.click(panel().getByRole('button', { name: 'Criar no quadro' }));
    expect(await screen.findByText('Todas as cenas já têm cartão no quadro.')).toBeDefined();
    expect(fake.saves).toHaveLength(flowSaves);
  });

  it('sem fluxo ligado, "Criar no quadro" cria um fluxo novo e liga o roteiro a ele', async () => {
    const fake = open([episode()]);
    await screen.findByRole('textbox', { name: 'Texto do roteiro' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Criar no quadro' })[0] as HTMLElement);
    expect(await screen.findByText('2 cartões criados no quadro.')).toBeDefined();
    const created = [...fake.projects.values()].find((project) => project.kind === 'flow');
    expect(created?.title).toBe('Roteiro — Episódio 12');
    expect(created?.kind === 'flow' && created.content.blocks).toHaveLength(2);
    await waitFor(() => expect(fake.scriptSaves.length).toBeGreaterThan(0));
    expect(fake.scriptSaves.at(-1)?.request.content.flowId).toBe(created?.id);
    expect(screen.getByRole('link', { name: 'Abrir o quadro' })).toBeDefined();
  });

  it('"Trazer do quadro" traz os cartões que ainda não são cena', async () => {
    const content = flowContentSchema.parse({
      ...createEmptyFlow(),
      blocks: [
        {
          id: 'cartao-1',
          type: 'card',
          position: { x: 112, y: 128 },
          size: { width: 280, height: 144 },
          title: 'Ideia solta',
          description: 'Falar do prazo',
        },
      ],
    });
    const fake = open([episode({ flowId: FLOW_ID }), flow(content)]);
    await screen.findByRole('textbox', { name: 'Texto do roteiro' });
    fireEvent.click(panel().getByRole('button', { name: 'Trazer do quadro' }));
    expect(await screen.findByText('1 cartão trazido do quadro como cena.')).toBeDefined();
    await waitFor(() => expect(fake.scriptSaves.length).toBeGreaterThan(0));
    const scenes = fake.scriptSaves.at(-1)?.request.content.scenes;
    expect(scenes?.at(-1)).toMatchObject({
      title: 'Ideia solta',
      narration: 'Falar do prazo',
      cardId: 'cartao-1',
    });
    // O texto do editor também ganhou a cena nova.
    expect(screen.getByRole('textbox', { name: 'Texto do roteiro' }).textContent).toContain(
      'Ideia solta',
    );
    // O quadro não foi gravado: trazer só lê.
    expect(fake.saves).toHaveLength(0);
  });

  it('"Atualizar do quadro" e "Atualizar o quadro" levam título e fala para o lado pedido', async () => {
    const content = flowContentSchema.parse({
      ...createEmptyFlow(),
      blocks: [
        {
          id: 'cartao-a',
          type: 'card',
          position: { x: 112, y: 128 },
          size: { width: 280, height: 144 },
          title: 'Título editado no quadro',
          description: 'Fala editada no quadro',
          tag: 'Cena 1',
        },
      ],
    });
    const fake = open([
      script({
        flowId: FLOW_ID,
        scenes: [
          createScene({ id: 'a', title: 'Gancho', narration: 'Fala velha', cardId: 'cartao-a' }),
        ],
      }),
      flow(content),
    ]);
    await screen.findByRole('textbox', { name: 'Texto do roteiro' });

    fireEvent.click(panel().getByRole('button', { name: 'Atualizar do quadro' }));
    expect(await screen.findByText('1 cena atualizada com o que está no quadro.')).toBeDefined();
    await waitFor(() => expect(fake.scriptSaves.length).toBeGreaterThan(0));
    expect(fake.scriptSaves.at(-1)?.request.content.scenes[0]).toMatchObject({
      title: 'Título editado no quadro',
      narration: 'Fala editada no quadro',
    });
    expect(fake.saves).toHaveLength(0);
    expect(panel().getByRole('button', { name: /Título editado no quadro/ })).toBeDefined();

    // Agora o contrário: muda a cena aqui e manda para o quadro.
    fireEvent.change(screen.getByRole('textbox', { name: 'Duração alvo' }), {
      target: { value: '3 min' },
    });
    fireEvent.click(panel().getByRole('button', { name: 'Atualizar o quadro' }));
    expect(await screen.findByText('Os cartões do quadro já estão iguais às cenas.')).toBeDefined();
    expect(fake.saves).toHaveLength(0);
  });

  it('os botões que precisam do quadro ficam desligados sem fluxo ligado', async () => {
    open([episode()]);
    await screen.findByRole('textbox', { name: 'Texto do roteiro' });
    for (const name of ['Trazer do quadro', 'Atualizar do quadro', 'Atualizar o quadro']) {
      expect(panel().getByRole('button', { name })).toHaveProperty('disabled', true);
    }
  });

  it('escolhe um dos fluxos da pessoa como fluxo vinculado e salva', async () => {
    const fake = open([episode(), flow()]);
    await screen.findByRole('textbox', { name: 'Texto do roteiro' });
    const select = await screen.findByRole('combobox', { name: 'Fluxo vinculado' });
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(2));
    fireEvent.change(select, { target: { value: FLOW_ID } });
    await waitFor(() => expect(fake.scriptSaves).toHaveLength(1));
    expect(fake.scriptSaves[0]?.request.content.flowId).toBe(FLOW_ID);
    // O link do fluxo aparece na linha "Fluxo vinculado" (e já estava na barra lateral).
    expect(await screen.findAllByRole('link', { name: 'Thumbnail do vídeo 12' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Trocar' })).toBeDefined();
  });

  it('se falar com o quadro falha, mostra o erro e não mexe no roteiro', async () => {
    const fake = open([episode({ flowId: FLOW_ID }), flow()]);
    await screen.findByRole('textbox', { name: 'Texto do roteiro' });
    fake.failNext('save', 'Sem conexão com o Trama.');
    fireEvent.click(panel().getByRole('button', { name: 'Criar no quadro' }));
    expect(await screen.findByText('Sem conexão com o Trama.')).toBeDefined();
    expect(panel().queryByText('No quadro')).toBeNull();
  });
});

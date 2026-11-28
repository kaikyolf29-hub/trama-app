import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from '@tanstack/react-router';
import { eventSchema, type AgendaEvent } from '@trama/core';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../App';
import { defaultServices, type Services } from '../../services';
import { createFakeAgenda } from '../../test/fake-agenda';
import { createFakeAuth } from '../../test/fake-auth';

afterEach(cleanup);

/** Hoje é 27 de novembro de 2026, 12:00 em São Paulo. */
const NOW = new Date('2026-11-27T15:00:00.000Z');
const FLOW = '6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f';

let counter = 0;
function event(type: AgendaEvent['type'], at: string, title: string, extra = {}): AgendaEvent {
  counter += 1;
  return eventSchema.parse({
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    type,
    occurredAt: at,
    projectId: type === 'note' ? null : FLOW,
    projectKind: type === 'note' ? null : 'flow',
    title,
    source: type === 'note' ? 'manual' : 'auto',
    createdAt: at,
    ...extra,
  });
}

// Quinta, 12 de novembro (horário de Brasília = UTC-3).
const created = event('created', '2026-11-12T14:32:00-03:00', 'Como editar 10x mais rápido');
const studied = event('studied', '2026-11-12T17:20:00-03:00', 'Atalhos de corte', {
  projectKind: 'notebook',
  detail: 'Premiere Pro',
});
const completed = event('completed', '2026-11-12T19:40:00-03:00', 'Como editar 10x mais rápido');
const note = event('note', '2026-11-20T09:00:00-03:00', 'Ideia do jogo', { detail: 'Cartas' });
const today = event('edited', '2026-11-27T10:15:00-03:00', 'Roteiro do episódio');

function renderAgenda(
  initial: AgendaEvent[] = [created, studied, completed, note, today],
  services: Partial<Services> = {},
  path = '/agenda',
) {
  const fake = createFakeAgenda(initial);
  const auth = createFakeAuth();
  auth.addAccount('Ana Souza', 'ana@exemplo.com', 'senha-segura-1');
  auth.signInAs('ana@exemplo.com');
  const history = createMemoryHistory({ initialEntries: [path] });
  render(
    <App
      client={auth.client}
      history={history}
      services={{ ...defaultServices, agenda: fake.api, now: () => NOW, ...services }}
    />,
  );
  return { fake, history };
}

const panel = () => within(screen.getByRole('complementary', { name: /·/ }));
const calendar = () => within(screen.getByRole('grid'));
const heatmap = () => within(screen.getByRole('group', { name: /^Dias de/ }));

async function openDay(label: string) {
  await screen.findByRole('grid');
  fireEvent.click(calendar().getByRole('button', { name: new RegExp(`^${label}`) }));
}

describe('Agenda: abrir', () => {
  it('só entra quem está logado', async () => {
    const auth = createFakeAuth();
    const history = createMemoryHistory({ initialEntries: ['/agenda'] });
    render(<App client={auth.client} history={history} services={defaultServices} />);
    await waitFor(() => expect(history.location.pathname).toBe('/entrar'));
  });

  it('o item da navegação leva à Agenda e fica marcado', async () => {
    const { history } = renderAgenda([], {}, '/');
    fireEvent.click(await screen.findByRole('link', { name: 'Agenda' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Agenda' })).toBeDefined();
    expect(history.location.pathname).toBe('/agenda');
    expect(screen.getByRole('link', { name: 'Agenda' }).getAttribute('aria-current')).toBe('page');
  });

  it('abre no mês de hoje, com o dia de hoje escolhido e o ano em quadradinhos', async () => {
    const { fake } = renderAgenda();
    expect(await screen.findByRole('heading', { level: 2, name: /Novembro/ })).toBeDefined();
    expect(
      screen.getByText(
        'Tudo que você criou, terminou ou estudou, no dia e na hora em que aconteceu.',
      ),
    ).toBeDefined();
    // Dois dias com algo feito já com os 3 do dia 12: 12, 20 e 27.
    expect(await screen.findByText('3 dias com algo feito')).toBeDefined();
    expect(panel().getByRole('heading', { name: 'Sexta · 27 nov' })).toBeDefined();
    expect(panel().getByText('Fluxo editado')).toBeDefined();
    // Uma consulta só, do ano de hoje (de 1º de janeiro, 00:00 em São Paulo).
    expect(fake.calls.list).toEqual([
      { from: '2026-01-01T03:00:00.000Z', to: '2027-01-01T03:00:00.000Z' },
    ]);
  });

  it('sem a API configurada, explica o que falta', async () => {
    renderAgenda([], { agenda: null });
    expect(await screen.findByText(/VITE_API_URL/)).toBeDefined();
  });
});

describe('Agenda: o dia', () => {
  it('mostra hora, ícone e o que aconteceu, e o fluxo abre o quadro', async () => {
    renderAgenda();
    await openDay('quinta-feira, 12 de novembro de 2026');
    expect(panel().getByRole('heading', { name: 'Quinta · 12 nov' })).toBeDefined();
    const items = panel().getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      '14:32Fluxo criadoComo editar 10x mais rápido',
      '17:20Aula estudadaAtalhos de corte · Premiere Pro',
      '19:40Fluxo concluídoComo editar 10x mais rápido',
    ]);
    const link = within(items[0]!).getByRole('link');
    expect(link.getAttribute('href')).toBe(`/p/${FLOW}`);
    // A aula é de um caderno: o link abre o caderno em Estudos.
    expect(within(items[1]!).getByRole('link').getAttribute('href')).toBe(`/estudos/${FLOW}`);
  });

  it('dia sem nada diz que não há nada registrado', async () => {
    renderAgenda();
    await openDay('segunda-feira, 2 de novembro de 2026');
    expect(panel().getByText('Nada registrado neste dia.')).toBeDefined();
    expect(panel().getByText(/A hora é registrada sozinha/)).toBeDefined();
  });

  it('clicar numa etiqueta do calendário abre o quadro do fluxo', async () => {
    const { history } = renderAgenda();
    const cell = (await screen.findAllByRole('gridcell')).find((c) =>
      within(c).queryByRole('button', { name: /^quinta-feira, 12 de novembro/ }),
    );
    const chip = within(cell!).getAllByRole('link')[0]!;
    fireEvent.click(chip);
    await waitFor(() => expect(history.location.pathname).toBe(`/p/${FLOW}`));
  });
});

describe('Agenda: navegar', () => {
  it('troca de mês sem buscar de novo e volta para hoje', async () => {
    const { fake } = renderAgenda();
    await screen.findByText('3 dias com algo feito');
    fireEvent.click(screen.getByRole('button', { name: 'Mês anterior' }));
    expect(await screen.findByRole('heading', { level: 2, name: /Outubro/ })).toBeDefined();
    expect(screen.getByText('Nada registrado neste mês.')).toBeDefined();
    expect(fake.calls.list).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Hoje' }));
    expect(await screen.findByRole('heading', { level: 2, name: /Novembro/ })).toBeDefined();
    expect(screen.queryByText('Nada registrado neste mês.')).toBeNull();
  });

  it('trocar de ano busca o ano novo', async () => {
    const { fake } = renderAgenda();
    await screen.findByText('3 dias com algo feito');
    fireEvent.click(screen.getByRole('button', { name: 'Ano anterior' }));
    expect(await screen.findByText('Nenhum dia com algo feito')).toBeDefined();
    expect(fake.calls.list[1]).toEqual({
      from: '2025-01-01T03:00:00.000Z',
      to: '2026-01-01T03:00:00.000Z',
    });
    expect(screen.getByRole('heading', { level: 2, name: '2025' })).toBeDefined();
  });

  it('a visão do ano mostra os quadradinhos e o painel do dia, sem o calendário', async () => {
    renderAgenda();
    await screen.findByText('3 dias com algo feito');
    fireEvent.click(screen.getByRole('button', { name: 'Ano' }));
    expect(screen.queryByRole('grid')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: /^quinta-feira, 12 de novembro de 2026: 3 registros/ }),
    );
    expect(panel().getByText('Aula estudada')).toBeDefined();
  });

  it('as setas do teclado andam pelos quadradinhos', async () => {
    renderAgenda();
    await screen.findByText('3 dias com algo feito');
    fireEvent.click(screen.getByRole('button', { name: 'Ano' }));
    const selected = heatmap().getByRole('button', {
      name: /^sexta-feira, 27 de novembro de 2026/,
    });
    fireEvent.keyDown(selected, { key: 'ArrowDown' });
    expect(panel().getByRole('heading', { name: 'Sábado · 28 nov' })).toBeDefined();
    fireEvent.keyDown(selected, { key: 'ArrowLeft' });
    expect(panel().getByRole('heading', { name: 'Sábado · 21 nov' })).toBeDefined();
  });

  it('a visão do dia mostra só o dia, com setas para o anterior e o próximo', async () => {
    renderAgenda();
    await screen.findByText('3 dias com algo feito');
    fireEvent.click(screen.getByRole('button', { name: 'Dia' }));
    expect(screen.getByRole('heading', { level: 2, name: /27 de novembro de 2026/ })).toBeDefined();
    expect(screen.getByText('Fluxo editado')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Dia anterior' }));
    expect(screen.getByRole('heading', { level: 2, name: /26 de novembro/ })).toBeDefined();
    expect(screen.getByText('Nada registrado neste dia.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Próximo dia' }));
    fireEvent.click(screen.getByRole('button', { name: 'Próximo dia' }));
    expect(screen.getByRole('heading', { level: 2, name: /28 de novembro/ })).toBeDefined();
  });
});

describe('Agenda: carregando e erro', () => {
  it('mostra "Carregando…" enquanto busca', async () => {
    const fake = createFakeAgenda();
    let release: () => void = () => undefined;
    const slow = {
      ...fake.api,
      list: (range: Parameters<typeof fake.api.list>[0]) =>
        new Promise<AgendaEvent[]>((resolve) => {
          release = () => resolve([]);
          void range;
        }),
    };
    renderAgenda([], { agenda: slow });
    expect((await screen.findAllByText('Carregando…')).length).toBeGreaterThan(0);
    release();
    expect(await screen.findByText('Nada registrado neste dia.')).toBeDefined();
  });

  it('erro mostra a mensagem e "Tentar de novo" busca outra vez', async () => {
    const fake = createFakeAgenda([today]);
    fake.failNext('list', 'Não deu para carregar a Agenda.');
    renderAgenda([], { agenda: fake.api });
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('Não deu para carregar a Agenda.'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Fluxo editado')).toBeDefined();
    expect(fake.calls.list).toHaveLength(2);
  });
});

describe('Agenda: registrar algo', () => {
  async function openForm() {
    await screen.findByText('3 dias com algo feito');
    fireEvent.click(screen.getByRole('button', { name: /Registrar algo/ }));
    return screen.findByRole('dialog', { name: 'Registrar algo' });
  }
  const type = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });

  it('agora: manda só o texto e a API grava a hora', async () => {
    const { fake } = renderAgenda();
    await openForm();
    type('O que aconteceu', '  Gravei o vídeo  ');
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(fake.calls.createNote).toEqual([{ title: 'Gravei o vídeo' }]);
    expect(panel().getByText('Gravei o vídeo')).toBeDefined();
  });

  it('no passado: converte o dia e a hora do fuso da pessoa e vai para esse dia', async () => {
    const { fake } = renderAgenda();
    await openForm();
    type('O que aconteceu', 'Aula de inglês');
    type('Detalhe (opcional)', 'Capítulo 3');
    type('Dia', '2026-11-10');
    type('Hora', '18:45');
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(fake.calls.createNote).toEqual([
      { title: 'Aula de inglês', detail: 'Capítulo 3', occurredAt: '2026-11-10T21:45:00.000Z' },
    ]);
    expect(panel().getByRole('heading', { name: 'Terça · 10 nov' })).toBeDefined();
    expect(panel().getByText('18:45')).toBeDefined();
    expect(panel().getByText('Capítulo 3')).toBeDefined();
  });

  it('recusa título vazio e momento no futuro, sem chamar a API', async () => {
    const { fake } = renderAgenda();
    await openForm();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('Escreva o que aconteceu.')).toBeDefined();
    type('O que aconteceu', 'Amanhã');
    type('Dia', '2026-11-28');
    type('Hora', '10:00');
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('Escolha um momento que já passou.')).toBeDefined();
    expect(fake.calls.createNote).toHaveLength(0);
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('se a API falhar, o formulário fica aberto com o aviso', async () => {
    const { fake } = renderAgenda();
    await openForm();
    fake.failNext('createNote', 'Sem conexão com o Trama.');
    type('O que aconteceu', 'Algo');
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('Sem conexão com o Trama.')).toBeDefined();
    expect(screen.getByRole('dialog')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('Esc e Cancelar fecham sem gravar', async () => {
    const { fake } = renderAgenda();
    await openForm();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    await openForm();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fake.calls.createNote).toHaveLength(0);
  });
});

describe('Agenda: apagar anotação', () => {
  it('só anotações têm o botão de apagar, e pede confirmação', async () => {
    const { fake } = renderAgenda();
    await openDay('sexta-feira, 20 de novembro de 2026');
    expect(panel().getByText('Cartas')).toBeDefined();
    fireEvent.click(panel().getByRole('button', { name: 'Apagar a anotação "Ideia do jogo"' }));
    fireEvent.click(panel().getByRole('button', { name: 'Cancelar' }));
    expect(fake.calls.remove).toHaveLength(0);

    fireEvent.click(panel().getByRole('button', { name: 'Apagar a anotação "Ideia do jogo"' }));
    fireEvent.click(panel().getByRole('button', { name: 'Apagar' }));
    await waitFor(() => expect(panel().getByText('Nada registrado neste dia.')).toBeDefined());
    expect(fake.calls.remove).toEqual([note.id]);

    await openDay('quinta-feira, 12 de novembro de 2026');
    expect(panel().queryByRole('button', { name: /Apagar a anotação/ })).toBeNull();
  });

  it('se a API recusar, mostra o aviso e mantém a anotação', async () => {
    const { fake } = renderAgenda();
    await openDay('sexta-feira, 20 de novembro de 2026');
    fake.failNext('remove', 'Algo deu errado. Tente de novo em instantes.');
    fireEvent.click(panel().getByRole('button', { name: 'Apagar a anotação "Ideia do jogo"' }));
    fireEvent.click(panel().getByRole('button', { name: 'Apagar' }));
    expect(await panel().findByRole('alert')).toBeDefined();
    expect(panel().getByText('Ideia do jogo')).toBeDefined();
  });
});

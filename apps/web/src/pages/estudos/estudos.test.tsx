import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../App';
import { defaultServices, type Services } from '../../services';
import { createFakeAccount } from '../../test/fake-account';
import { createFakeAuth } from '../../test/fake-auth';
import { createFakeStudies, lesson, notebook } from '../../test/fake-studies';

afterEach(cleanup);

/** Quinta, 12 de novembro de 2026, 17:00 em São Paulo. */
const NOW = new Date('2026-11-12T20:00:00.000Z');

const premiere = notebook(1, 'Premiere Pro', { color: 'blue', reviewAfterDays: 5 });
const english = notebook(2, 'Inglês', { color: 'green' });
const lessons = [
  lesson(1, premiere.id, {
    title: 'Atalhos de corte',
    status: 'done',
    studiedAt: '2026-11-12T17:32:00.000Z',
    reviewOn: '2026-11-19',
    position: 0,
  }),
  lesson(2, premiere.id, {
    title: 'Correção de cor básica',
    status: 'done',
    studiedAt: '2026-11-05T23:10:00.000Z',
    reviewOn: '2026-11-12',
    position: 1,
  }),
  lesson(3, english.id, { title: 'Phrasal verbs', position: 0 }),
];

function renderStudies(
  path = '/estudos',
  options: {
    notebooks?: (typeof premiere)[];
    lessons?: typeof lessons;
    services?: Partial<Services>;
    signedIn?: boolean;
    /** Roda antes de a tela abrir (por exemplo, para a primeira chamada falhar). */
    setup?: (fake: ReturnType<typeof createFakeStudies>) => void;
  } = {},
) {
  const fake = createFakeStudies({
    notebooks: options.notebooks ?? [premiere, english],
    lessons: options.lessons ?? lessons,
  });
  options.setup?.(fake);
  const account = createFakeAccount();
  const auth = createFakeAuth();
  if (options.signedIn !== false) {
    auth.addAccount('Ana Souza', 'ana@exemplo.com', 'senha-segura-1');
    auth.signInAs('ana@exemplo.com');
  }
  const history = createMemoryHistory({ initialEntries: [path] });
  render(
    <App
      client={auth.client}
      history={history}
      services={{
        ...defaultServices,
        notebooks: fake.notebooksApi,
        lessons: fake.lessonsApi,
        account: account.api,
        now: () => NOW,
        ...options.services,
      }}
    />,
  );
  return { fake, account, history };
}

describe('Estudos: a lista', () => {
  it('só entra quem está logado', async () => {
    const { history } = renderStudies('/estudos', { signedIn: false });
    await waitFor(() => expect(history.location.pathname).toBe('/entrar'));
  });

  it('sem a API configurada, explica o que falta', async () => {
    renderStudies('/estudos', { services: { notebooks: null, lessons: null } });
    expect(await screen.findByText(/VITE_API_URL/)).toBeDefined();
  });

  it('mostra os cadernos com o resumo e as aulas com data e selo', async () => {
    renderStudies();
    const main = within(await screen.findByRole('main'));
    const card = await main.findByRole('link', { name: /Premiere Pro/ });
    expect(card.textContent).toContain('2 aulas · 1 para revisar');
    expect(main.getByRole('link', { name: /Inglês/ }).textContent).toContain('1 aula · em dia');
    expect(
      main
        .getByRole('progressbar', { name: 'Progresso de Premiere Pro' })
        .getAttribute('aria-valuenow'),
    ).toBe('100');

    const rows = main.getAllByRole('row');
    const row = rows.find((r) => r.textContent?.includes('Atalhos de corte'))!;
    expect(row.textContent).toContain('Feito');
    expect(row.textContent).toContain('12 nov · 14:32');
    expect(row.textContent).toContain('19 nov');
    const due = rows.find((r) => r.textContent?.includes('Correção de cor básica'))!;
    expect(due.textContent).toContain('Revisar');
    expect(due.textContent).toContain('Hoje');
  });

  it('a aba Revisões só traz o que passou do dia', async () => {
    renderStudies();
    fireEvent.click(await screen.findByRole('tab', { name: /Revisões/ }));
    const panel = within(screen.getByRole('tabpanel', { name: 'Revisões' }));
    expect(panel.getAllByRole('row')).toHaveLength(2);
    expect(panel.getByText('Correção de cor básica')).toBeDefined();
  });

  it('usa o fuso do perfil nas datas', async () => {
    renderStudies('/estudos', {
      services: { account: createFakeAccount({ timezone: 'UTC' }).api },
    });
    const main = within(await screen.findByRole('main'));
    const row = (await main.findAllByRole('row')).find((r) => r.textContent?.includes('Atalhos'))!;
    expect(row.textContent).toContain('12 nov · 17:32');
  });

  it('erro ao carregar tem "Tentar de novo"', async () => {
    renderStudies('/estudos', {
      setup: (fake) => fake.failNext('lessons.listAll', 'Não deu para carregar as aulas.'),
    });
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Não deu para carregar as aulas.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(
      await within(screen.getByRole('main')).findByRole('link', { name: /Premiere Pro/ }),
    ).toBeDefined();
  });

  it('o resumo semanal liga e desliga no perfil', async () => {
    const { account } = renderStudies();
    const toggle = await screen.findByRole('switch', { name: 'Resumo semanal por e-mail' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('false'));
    expect(account.state.patches).toEqual([{ emailPreferences: { weeklySummary: false } }]);
  });

  it('criar um caderno abre o caderno novo', async () => {
    const { fake, history } = renderStudies();
    fireEvent.click(await screen.findByRole('button', { name: 'Novo caderno' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Novo caderno' }));
    fireEvent.click(dialog.getByRole('button', { name: 'Criar caderno' }));
    expect(await dialog.findByText('Dê um nome ao caderno (até 200 letras).')).toBeDefined();

    fireEvent.change(dialog.getByLabelText('Nome'), { target: { value: 'Programação' } });
    fireEvent.click(dialog.getByLabelText(/Rosa/));
    fireEvent.change(dialog.getByLabelText('Revisar depois de quantos dias'), {
      target: { value: '10' },
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Criar caderno' }));
    await waitFor(() => expect(history.location.pathname).toMatch(/^\/estudos\/.+/));
    expect(fake.notebooksApi.create).toHaveBeenCalledWith({
      title: 'Programação',
      content: { description: '', color: 'pink', reviewAfterDays: 10 },
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Programação' })).toBeDefined();
  });
});

describe('Estudos: o caderno', () => {
  it('"Marcar como estudada" grava a data de agora e o dia da revisão do caderno', async () => {
    const { fake } = renderStudies(`/estudos/${english.id}`);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Marcar como estudada: Phrasal verbs' }),
    );
    await waitFor(() => expect(fake.lessonsApi.update).toHaveBeenCalled());
    // O inglês usa o intervalo padrão de 7 dias.
    expect(fake.lessonsApi.update).toHaveBeenCalledWith(english.id, lessons[2]!.id, {
      status: 'done',
      studiedAt: '2026-11-12T20:00:00.000Z',
      reviewOn: '2026-11-19',
    });
    expect(await screen.findByRole('button', { name: 'Revisei: Phrasal verbs' })).toBeDefined();
    expect(screen.getByText(/marcada como estudada. Revisão em 19 nov/)).toBeDefined();
  });

  it('"Revisei" usa o intervalo do caderno e grava a data da revisão', async () => {
    const { fake } = renderStudies(`/estudos/${premiere.id}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Revisei: Correção de cor básica' }));
    await waitFor(() => expect(fake.lessonsApi.update).toHaveBeenCalled());
    expect(fake.lessonsApi.update).toHaveBeenCalledWith(premiere.id, lessons[1]!.id, {
      status: 'done',
      reviewedAt: '2026-11-12T20:00:00.000Z',
      reviewOn: '2026-11-17',
    });
  });

  it('adiciona, sobe e apaga aulas, e o apagar pede confirmação', async () => {
    const { fake } = renderStudies(`/estudos/${premiere.id}`);
    fireEvent.change(await screen.findByLabelText('Nome da nova aula'), {
      target: { value: 'Áudio limpo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar aula' }));
    expect(await screen.findByRole('button', { name: /detalhes de Áudio limpo/ })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Subir "Correção de cor básica"' }));
    await waitFor(() => expect(fake.lessonsApi.update).toHaveBeenCalledTimes(2));
    expect(fake.lessonsApi.update).toHaveBeenCalledWith(premiere.id, lessons[1]!.id, {
      position: 0,
    });
    expect(fake.lessonsApi.update).toHaveBeenCalledWith(premiere.id, lessons[0]!.id, {
      position: 1,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Apagar a aula "Atalhos de corte"' }));
    expect(fake.lessonsApi.remove).not.toHaveBeenCalled();
    const confirm = within(screen.getByRole('group', { name: 'Apagar Atalhos de corte' }));
    fireEvent.click(confirm.getByRole('button', { name: 'Apagar' }));
    await waitFor(() => expect(fake.lessonsApi.remove).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /detalhes de Atalhos de corte/ })).toBeNull(),
    );
  });

  it('as notas salvam ao sair do campo, só se mudaram', async () => {
    const { fake } = renderStudies(`/estudos/${premiere.id}`);
    fireEvent.click(await screen.findByRole('button', { name: /detalhes de Atalhos de corte/ }));
    const notes = screen.getByLabelText('Notas da aula');
    fireEvent.blur(notes);
    expect(fake.lessonsApi.update).not.toHaveBeenCalled();
    fireEvent.change(notes, { target: { value: 'Atalho C corta.' } });
    fireEvent.blur(notes);
    await waitFor(() =>
      expect(fake.lessonsApi.update).toHaveBeenCalledWith(premiere.id, lessons[0]!.id, {
        notes: 'Atalho C corta.',
      }),
    );
  });

  it('erro ao gravar aparece e a aula continua como estava', async () => {
    const { fake } = renderStudies(`/estudos/${english.id}`);
    fake.failNext('lessons.update', 'Não deu para salvar.');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Marcar como estudada: Phrasal verbs' }),
    );
    expect((await screen.findByRole('alert')).textContent).toContain('Não deu para salvar.');
    expect(
      screen.getByRole('button', { name: 'Marcar como estudada: Phrasal verbs' }),
    ).toBeDefined();
  });

  it('apagar o caderno pede confirmação e volta para Estudos', async () => {
    const { fake, history } = renderStudies(`/estudos/${english.id}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Apagar caderno' }));
    expect(fake.notebooksApi.remove).not.toHaveBeenCalled();
    expect(screen.getByText(/A aula dele some junto/)).toBeDefined();
    const confirm = within(screen.getByRole('group', { name: /Apagar Inglês/ }));
    fireEvent.click(confirm.getByRole('button', { name: 'Apagar caderno' }));
    await waitFor(() => expect(history.location.pathname).toBe('/estudos'));
    expect(fake.notebooks.has(english.id)).toBe(false);
  });

  it('caderno que não existe avisa', async () => {
    renderStudies('/estudos/99999999-9999-4999-8999-999999999999');
    expect(await screen.findByText(/Não achei este caderno/)).toBeDefined();
  });
});

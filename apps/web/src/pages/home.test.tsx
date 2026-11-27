import { createMemoryHistory } from '@tanstack/react-router';
import { createEmptyFlow, flowTemplates, type FlowProject } from '@trama/core';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
  type RenderResult,
} from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { App } from '../App';
import { defaultServices, type Services } from '../services';
import { createFakeAuth } from '../test/fake-auth';
import { createFakeProjects } from '../test/fake-projects';

// O jsdom não tem ResizeObserver nem DOMMatrixReadOnly, que o quadro (React Flow) usa.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  globalThis.DOMMatrixReadOnly ??= class {
    m22 = 1;
  } as unknown as typeof DOMMatrixReadOnly;
});

afterEach(cleanup);

/** Um projeto editado há `minutes` minutos (a hora de agora vem do relógio real). */
function project(n: number, overrides: Partial<FlowProject> = {}, minutes = n): FlowProject {
  const at = new Date(Date.now() - minutes * 60_000).toISOString();
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    kind: 'flow',
    title: `Projeto ${n}`,
    status: 'draft',
    revision: 1,
    driveFileId: null,
    createdAt: at,
    updatedAt: at,
    content: createEmptyFlow(),
    ...overrides,
  };
}

function renderHome(
  initial: FlowProject[] = [],
  services?: Partial<Services>,
  fake = createFakeProjects(initial),
) {
  const auth = createFakeAuth();
  auth.addAccount('Ana Souza', 'ana@exemplo.com', 'senha-segura-1');
  auth.signInAs('ana@exemplo.com');
  const history = createMemoryHistory({ initialEntries: ['/'] });
  const view: RenderResult = render(
    <App
      client={auth.client}
      history={history}
      services={{ ...defaultServices, projects: fake.api, autosaveDelay: 20, ...services }}
    />,
  );
  return { fake, history, view };
}

const rows = () => screen.getAllByRole('row').slice(1);
const rowOf = (title: string) => {
  const row = rows().find((candidate) => within(candidate).queryByText(title));
  if (!row) throw new Error(`linha não encontrada: ${title}`);
  return row;
};

describe('Início: modelos', () => {
  it('mostra a saudação com o nome, os seis modelos e o status do Drive', async () => {
    renderHome();
    expect(await screen.findByRole('heading', { level: 1 })).toHaveProperty(
      'textContent',
      expect.stringMatching(/^(Bom dia|Boa tarde|Boa noite), Ana$/),
    );
    const templates = within(screen.getByRole('region', { name: 'Começar algo novo' }));
    expect(templates.getAllByRole('button').map((button) => button.textContent)).toEqual(
      flowTemplates.map((template) => `${template.title}${template.description}`),
    );
    expect(screen.getByRole('region', { name: /Google Drive/ }).textContent).toContain(
      'Google Drive · conectar em breve',
    );
  });

  it('um clique num modelo cria o projeto com o conteúdo dele e abre no quadro', async () => {
    const { fake, history } = renderHome();
    fireEvent.click(await screen.findByRole('button', { name: /Aula por etapas/ }));
    await waitFor(() => expect(history.location.pathname).toMatch(/^\/p\//));
    expect(fake.projects.size).toBe(1);
    const [created] = [...fake.projects.values()];
    expect(created?.title).toBe('Aula por etapas');
    expect(created?.content.frames).toHaveLength(4);
    expect(created?.content.presentation).toHaveLength(4);
    expect(await screen.findByRole('heading', { name: 'Aula por etapas' })).toBeDefined();
  });

  it('o fluxo em branco abre vazio, como "Sem título"', async () => {
    const { fake, history } = renderHome();
    fireEvent.click(await screen.findByRole('button', { name: /Fluxo em branco/ }));
    await waitFor(() => expect(history.location.pathname).toMatch(/^\/p\//));
    expect([...fake.projects.values()][0]).toMatchObject({
      title: 'Sem título',
      content: createEmptyFlow(),
    });
  });

  it('"Falar e organizar" abre o quadro com a nota que explica que a voz vem depois', async () => {
    const { fake, history } = renderHome();
    fireEvent.click(await screen.findByRole('button', { name: /Falar e organizar/ }));
    await waitFor(() => expect(history.location.pathname).toMatch(/^\/p\//));
    const [created] = [...fake.projects.values()];
    expect(created?.content.blocks).toHaveLength(1);
    expect(created?.content.blocks[0]).toMatchObject({ type: 'sticky' });
  });

  it('se criar falha, avisa, continua no Início e libera os modelos de novo', async () => {
    const { fake, history } = renderHome();
    fake.failNext('create', 'Sem conexão com o Trama.');
    const video = await screen.findByRole('button', { name: /Fluxo de vídeo/ });
    fireEvent.click(video);
    expect(await screen.findByText('Sem conexão com o Trama.')).toBeDefined();
    expect(history.location.pathname).toBe('/');
    expect(fake.projects.size).toBe(0);
    await waitFor(() => expect(video).toHaveProperty('disabled', false));
    fireEvent.click(video);
    await waitFor(() => expect(history.location.pathname).toMatch(/^\/p\//));
  });

  it('sem a API configurada, explica o que falta', async () => {
    renderHome([], { projects: null });
    expect(await screen.findByText(/VITE_API_URL/)).toBeDefined();
    expect(screen.queryByRole('button', { name: /Fluxo em branco/ })).toBeNull();
    expect(screen.getByRole('region', { name: /Google Drive/ })).toBeDefined();
  });
});

describe('Início: recentes', () => {
  it('lista título, tipo, status e quando foi editado, do mais recente para o mais antigo', async () => {
    renderHome([
      project(1, { title: 'Aula de edição', status: 'in_progress' }, 2),
      project(2, { title: 'Roteiro do episódio', status: 'done' }, 60 * 24 * 3),
      project(3, { title: 'Ideia do jogo' }, 1),
    ]);
    expect(await screen.findByText('Aula de edição')).toBeDefined();
    expect(rows().map((row) => within(row).getByRole('link').textContent)).toEqual([
      'Ideia do jogo',
      'Aula de edição',
      'Roteiro do episódio',
    ]);
    const aula = within(rowOf('Aula de edição'));
    expect(aula.getByText('Fluxo')).toBeDefined();
    expect(aula.getAllByText('há 2 min')).toHaveLength(2); // no celular, sob o nome; no resto, na coluna
    expect(aula.getByRole('combobox', { name: /Status de Aula de edição/ })).toHaveProperty(
      'value',
      'in_progress',
    );
    expect(
      within(rowOf('Roteiro do episódio')).getByRole('combobox', {
        name: /Status de Roteiro do episódio/,
      }),
    ).toHaveProperty('value', 'done');
  });

  it('abre o projeto pelo nome', async () => {
    const { history } = renderHome([project(1, { title: 'Aula de edição' })]);
    fireEvent.click(await screen.findByRole('link', { name: 'Aula de edição' }));
    await waitFor(() => expect(history.location.pathname).toBe(`/p/${project(1).id}`));
    expect(await screen.findByRole('heading', { name: 'Aula de edição' })).toBeDefined();
  });

  it('sem projetos, convida a escolher um modelo', async () => {
    renderHome();
    expect(await screen.findByText(/Nenhum projeto ainda/)).toBeDefined();
    expect(screen.getByRole('link', { name: /fluxo de vídeo de exemplo/ })).toBeDefined();
  });

  it('mostra o carregando e depois o erro, com "Tentar de novo"', async () => {
    const fake = createFakeProjects([project(1, { title: 'Aula de edição' })]);
    fake.failNext('list', 'Sem conexão com o Trama.');
    renderHome([], undefined, fake);
    expect(await screen.findByText('Sem conexão com o Trama.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Aula de edição')).toBeDefined();
    expect(screen.queryByText('Sem conexão com o Trama.')).toBeNull();
  });

  it('só mostra os dez mais recentes, e "Mostrar todos" abre o resto', async () => {
    renderHome(Array.from({ length: 12 }, (_, i) => project(i + 1)));
    await screen.findByText('Projeto 1');
    expect(rows()).toHaveLength(10);
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar todos (12)' }));
    expect(rows()).toHaveLength(12);
    expect(screen.queryByRole('button', { name: /Mostrar todos/ })).toBeNull();
  });
});

describe('Início: renomear, status e apagar', () => {
  it('renomeia com Enter, guarda o novo nome e sobe a linha para o alto', async () => {
    const { fake } = renderHome([project(1, { title: 'Antigo' }, 5), project(2, {}, 1)]);
    await screen.findByText('Antigo');
    fireEvent.click(screen.getByRole('button', { name: 'Renomear Antigo' }));
    const field = screen.getByRole('textbox', { name: 'Novo nome' });
    fireEvent.change(field, { target: { value: '  Novo nome  ' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await screen.findByText('Novo nome');
    expect(fake.update).toHaveBeenCalledWith(project(1).id, { title: 'Novo nome' });
    expect(within(rows()[0] as HTMLElement).getByText('Novo nome')).toBeDefined();
    expect(screen.queryByRole('textbox', { name: 'Novo nome' })).toBeNull();
  });

  it('sair do campo também confirma; Esc, nome igual ou em branco cancelam', async () => {
    const { fake } = renderHome([project(1, { title: 'Antigo' })]);
    await screen.findByText('Antigo');

    fireEvent.click(screen.getByRole('button', { name: 'Renomear Antigo' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Novo nome' }), { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: 'Novo nome' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Renomear Antigo' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Novo nome' }), {
      target: { value: '  ' },
    });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Novo nome' }), { key: 'Enter' });

    fireEvent.click(screen.getByRole('button', { name: 'Renomear Antigo' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Novo nome' }), { key: 'Enter' });
    expect(fake.update).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Renomear Antigo' }));
    const field = screen.getByRole('textbox', { name: 'Novo nome' });
    fireEvent.change(field, { target: { value: 'Pelo blur' } });
    fireEvent.blur(field);
    await screen.findByText('Pelo blur');
    expect(fake.update).toHaveBeenCalledTimes(1);
  });

  it('muda o status pela lista', async () => {
    const { fake } = renderHome([project(1, { title: 'Aula' })]);
    const select = await screen.findByRole('combobox', { name: 'Status de Aula' });
    fireEvent.change(select, { target: { value: 'done' } });
    await waitFor(() =>
      expect(fake.update).toHaveBeenCalledWith(project(1).id, { status: 'done' }),
    );
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Status de Aula' })).toHaveProperty(
        'value',
        'done',
      ),
    );
    expect(screen.getByRole('option', { name: 'Concluído' })).toBeDefined();
  });

  it('erro ao renomear ou mudar o status aparece e o nome antigo fica', async () => {
    const { fake } = renderHome([project(1, { title: 'Aula' })]);
    await screen.findByText('Aula');
    fake.failNext('update', 'Sem conexão com o Trama.');
    fireEvent.change(screen.getByRole('combobox', { name: 'Status de Aula' }), {
      target: { value: 'done' },
    });
    expect(await screen.findByText('Sem conexão com o Trama.')).toBeDefined();
    expect(screen.getByRole('combobox', { name: 'Status de Aula' })).toHaveProperty(
      'value',
      'draft',
    );
  });

  it('apagar pede confirmação: cancelar mantém, confirmar remove', async () => {
    const { fake } = renderHome([project(1, { title: 'Aula' }), project(2, { title: 'Roteiro' })]);
    await screen.findByText('Aula');

    fireEvent.click(screen.getByRole('button', { name: 'Apagar Aula' }));
    const confirm = screen.getByRole('group', { name: 'Apagar Aula' });
    expect(confirm.textContent).toContain('não dá para desfazer');
    expect(fake.remove).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('group', { name: 'Apagar Aula' })).toBeNull();
    expect(screen.getByText('Aula')).toBeDefined();
    expect(fake.remove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Apagar Aula' }));
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Apagar Aula' })).getByRole('button', {
        name: 'Apagar',
      }),
    );
    await waitFor(() => expect(screen.queryByText('Aula')).toBeNull());
    expect(fake.remove).toHaveBeenCalledWith(project(1).id);
    expect(fake.projects.has(project(1).id)).toBe(false);
    expect(screen.getByText('Roteiro')).toBeDefined();
  });

  it('se apagar falha, avisa e a confirmação continua aberta', async () => {
    const { fake } = renderHome([project(1, { title: 'Aula' })]);
    await screen.findByText('Aula');
    fake.failNext('remove', 'Sem conexão com o Trama.');
    fireEvent.click(screen.getByRole('button', { name: 'Apagar Aula' }));
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Apagar Aula' })).getByRole('button', {
        name: 'Apagar',
      }),
    );
    expect(await screen.findByText('Sem conexão com o Trama.')).toBeDefined();
    expect(screen.getByRole('group', { name: 'Apagar Aula' })).toBeDefined();
    expect(fake.projects.size).toBe(1);
  });
});

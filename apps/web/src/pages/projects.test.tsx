import { createMemoryHistory } from '@tanstack/react-router';
import { flowContentSchema, type FlowProject } from '@trama/core';
import { videoFlowExample } from '@trama/core/fixtures';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const video: FlowProject = {
  id: '6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f',
  kind: 'flow',
  title: 'Como editar 10x mais rápido',
  status: 'draft',
  revision: 1,
  driveFileId: null,
  createdAt: '2026-11-27T10:00:00.000Z',
  updatedAt: '2026-11-27T10:00:00.000Z',
  content: flowContentSchema.parse(videoFlowExample),
};

function renderAt(path: string, fake = createFakeProjects([video]), services?: Partial<Services>) {
  const auth = createFakeAuth();
  auth.addAccount('Ana Souza', 'ana@exemplo.com', 'senha-segura-1');
  auth.signInAs('ana@exemplo.com');
  const history = createMemoryHistory({ initialEntries: [path] });
  render(
    <App
      client={auth.client}
      history={history}
      services={{ ...defaultServices, projects: fake.api, autosaveDelay: 20, ...services }}
    />,
  );
  return { fake, history };
}

describe('projetos', () => {
  it('o início lista os fluxos e abre cada um', async () => {
    const { history } = renderAt('/');
    const list = await screen.findByRole('list');
    fireEvent.click(within(list).getByRole('link', { name: /Como editar 10x mais rápido/ }));
    await waitFor(() => expect(history.location.pathname).toBe(`/p/${video.id}`));
    expect(
      await screen.findByRole('heading', { name: 'Como editar 10x mais rápido' }),
    ).toBeDefined();
  });

  it('"Novo fluxo" cria e já abre no quadro, em um clique', async () => {
    const fake = createFakeProjects();
    const { history } = renderAt('/', fake);
    expect(await screen.findByText(/Nenhum fluxo ainda/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Novo fluxo' }));
    await waitFor(() => expect(history.location.pathname).toMatch(/^\/p\//));
    expect(await screen.findByRole('heading', { name: 'Sem título' })).toBeDefined();
    expect(screen.getByRole('status').textContent).toContain('Salvo');
    expect(fake.projects.size).toBe(1);
  });

  it('salva sozinho depois de uma mudança, com a revisão certa', async () => {
    const { fake } = renderAt(`/p/${video.id}`);
    const badge = await screen.findByRole('checkbox', { name: /Vídeo pronto/ });
    fireEvent.click(badge);
    expect(screen.getAllByRole('status').some((s) => s.textContent?.includes('não salvas'))).toBe(
      true,
    );
    await waitFor(() => expect(fake.saves).toHaveLength(1));
    expect(fake.saves[0]?.request.baseRevision).toBe(1);
    const card = fake.saves[0]?.request.content.blocks.find((b) => b.id === 'card-projeto');
    expect(card?.type === 'card' && card.status?.done).toBe(false);
    await waitFor(() =>
      expect(screen.getAllByRole('status').some((s) => s.textContent === 'Salvo')).toBe(true),
    );

    fireEvent.click(badge);
    await waitFor(() => expect(fake.saves).toHaveLength(2));
    expect(fake.saves[1]?.request.baseRevision).toBe(2);
  });

  it('"Apresentar" abre o modo aula com o nome do projeto, e apresentar não salva nada', async () => {
    const { fake } = renderAt(`/p/${video.id}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Apresentar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Modo aula' });
    expect(within(dialog).getByText('MODO AULA')).toBeDefined();
    expect(within(dialog).getAllByText('Como editar 10x mais rápido').length).toBeGreaterThan(1);
    expect(within(dialog).getByText('Passo 1 de 4')).toBeDefined();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(within(dialog).getByText('Passo 2 de 4')).toBeDefined();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Modo aula' })).toBeNull();
    // Espera mais que o salvamento sozinho (20 ms nos testes): nada foi gravado.
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(fake.saves).toHaveLength(0);
  });

  it('avisa quando não salvou e tenta de novo sozinho', async () => {
    const { fake } = renderAt(`/p/${video.id}`);
    fake.failNextSave('Sem conexão com o Trama.');
    fireEvent.click(await screen.findByRole('checkbox', { name: /Vídeo pronto/ }));
    await waitFor(() =>
      expect(screen.getAllByRole('status').some((s) => s.textContent?.includes('Não salvou'))).toBe(
        true,
      ),
    );
    await waitFor(() => expect(fake.saves).toHaveLength(1));
  });

  it('projeto que não existe mostra o erro e o caminho de volta', async () => {
    renderAt('/p/00000000-0000-4000-8000-000000000000');
    expect(await screen.findByText('Projeto não encontrado.')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Voltar para o início' })).toBeDefined();
  });

  it('sem a API configurada, explica o que falta', async () => {
    renderAt(`/p/${video.id}`, undefined, { projects: null });
    expect(await screen.findByText(/VITE_API_URL/)).toBeDefined();
  });
});

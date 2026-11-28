import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { defaultServices } from '../services';
import { createFakeAccount } from '../test/fake-account';
import { createFakeAuth } from '../test/fake-auth';
import {
  CONNECTOR,
  DEFAULT_CONSENT,
  createFakeConnectors,
  expiredTicket,
} from '../test/fake-connectors';
import { createFakeProjects } from '../test/fake-projects';

afterEach(cleanup);

function renderAt(
  path: string,
  connectors: ReturnType<typeof createFakeConnectors> | null,
  extra: Partial<typeof defaultServices> = {},
) {
  const auth = createFakeAuth();
  auth.addAccount('Ana Souza', 'ana@exemplo.com', 'senha-segura-1');
  auth.signInAs('ana@exemplo.com');
  const redirectTo = vi.fn();
  render(
    <App
      client={auth.client}
      history={createMemoryHistory({ initialEntries: [path] })}
      services={{
        ...defaultServices,
        projects: createFakeProjects([]).api,
        account: createFakeAccount().api,
        connectors: connectors?.api ?? null,
        redirectTo,
        now: () => new Date('2026-11-28T15:00:00.000Z'),
        ...extra,
      }}
    />,
  );
  return { auth, redirectTo };
}

describe('tela de consentimento do conector', () => {
  it('mostra o cliente, para onde o acesso vai e as permissões pedidas', async () => {
    const fake = createFakeConnectors();
    renderAt('/conectar#t=bilhete-1', fake);
    expect(
      await screen.findByRole('heading', { name: /Permitir que Claude use o seu Trama/ }),
    ).toBeDefined();
    expect(fake.state.infoCalls).toEqual(['bilhete-1']);
    expect(screen.getByText('claude.ai')).toBeDefined();
    expect(screen.getByText(/O nome é informado pelo próprio aplicativo/)).toBeDefined();
    expect(screen.getByText('Leitura')).toBeDefined();
    const write = screen.getByRole('switch', { name: 'Escrita' });
    expect(write.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText(/Nunca apaga nada/)).toBeDefined();
    expect(screen.getByLabelText('Confirme a sua senha')).toHaveProperty('type', 'password');
  });

  it('o nome do cliente aparece como texto, nunca como HTML', async () => {
    const fake = createFakeConnectors({
      consent: { ...DEFAULT_CONSENT, clientName: '<img src=x onerror=alert(1)>Claude' },
    });
    renderAt('/conectar#t=b', fake);
    await screen.findByRole('heading', { name: /Permitir que/ });
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getAllByText(/<img src=x/).length).toBeGreaterThan(0);
  });

  it('mostra o domínio verificado e avisa quando o retorno é um app no computador', async () => {
    const fake = createFakeConnectors({
      consent: {
        ...DEFAULT_CONSENT,
        clientDomain: 'claude.ai',
        redirectHost: 'localhost',
        redirectIsLoopback: true,
        scopes: ['trama:read'],
      },
    });
    renderAt('/conectar#t=b', fake);
    await screen.findByRole('heading', { name: /Permitir que/ });
    expect(screen.getByText(/Domínio verificado: claude.ai/)).toBeDefined();
    expect(screen.getByText(/no seu próprio computador/)).toBeDefined();
    // Pediu só leitura: não há o que ligar.
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('permitir pede a senha, abre a sessão separada e manda o navegador de volta ao cliente', async () => {
    const fake = createFakeConnectors();
    const { auth, redirectTo } = renderAt('/conectar#t=bilhete-1', fake);
    await screen.findByRole('heading', { name: /Permitir que/ });

    fireEvent.click(screen.getByRole('button', { name: 'Permitir' }));
    expect(await screen.findByText('Digite a sua senha para confirmar.')).toBeDefined();
    expect(fake.state.allowed).toEqual([]);

    fireEvent.change(screen.getByLabelText('Confirme a sua senha'), {
      target: { value: 'errada' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Permitir' }));
    expect(await screen.findByText('E-mail ou senha incorretos.')).toBeDefined();
    expect(fake.state.allowed).toEqual([]);

    fireEvent.change(screen.getByLabelText('Confirme a sua senha'), {
      target: { value: 'senha-segura-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Permitir' }));
    await waitFor(() =>
      expect(redirectTo).toHaveBeenCalledWith('https://claude.ai/callback?code=abc&state=x'),
    );
    expect(fake.state.allowed).toEqual([
      {
        ticket: 'bilhete-1',
        scopes: ['trama:read', 'trama:write'],
        refreshToken: 'refresh-do-conector',
        accessToken: 'acesso-do-conector',
      },
    ]);
    expect(auth.calls.openConnectorSession).toEqual(['errada', 'senha-segura-1']);
    // A sessão do conector não fica na tela.
    expect(document.body.textContent).not.toContain('refresh-do-conector');
  });

  it('a pessoa pode tirar a escrita antes de permitir', async () => {
    const fake = createFakeConnectors();
    const { redirectTo } = renderAt('/conectar#t=b', fake);
    await screen.findByRole('heading', { name: /Permitir que/ });
    fireEvent.click(screen.getByRole('switch', { name: 'Escrita' }));
    fireEvent.change(screen.getByLabelText('Confirme a sua senha'), {
      target: { value: 'senha-segura-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Permitir' }));
    await waitFor(() => expect(redirectTo).toHaveBeenCalled());
    expect(fake.state.allowed[0]?.scopes).toEqual(['trama:read']);
  });

  it('recusar não pede a senha e volta ao cliente com o erro', async () => {
    const fake = createFakeConnectors();
    const { redirectTo, auth } = renderAt('/conectar#t=b', fake);
    await screen.findByRole('heading', { name: /Permitir que/ });
    fireEvent.click(screen.getByRole('button', { name: 'Recusar' }));
    await waitFor(() =>
      expect(redirectTo).toHaveBeenCalledWith(
        'https://claude.ai/callback?error=access_denied&state=x',
      ),
    );
    expect(fake.state.denied).toEqual(['b']);
    expect(auth.calls.openConnectorSession).toEqual([]);
    expect(fake.state.allowed).toEqual([]);
  });

  it('bilhete vencido, sem bilhete ou sem conector ligado explicam o que houve', async () => {
    renderAt('/conectar#t=velho', createFakeConnectors({ consent: expiredTicket() }));
    expect(await screen.findByText(/Este pedido venceu/)).toBeDefined();
    cleanup();
    renderAt('/conectar', createFakeConnectors());
    expect(await screen.findByText(/não tem um pedido de conexão/)).toBeDefined();
    cleanup();
    renderAt('/conectar#t=x', null);
    expect(await screen.findByText(/falta VITE_MCP_URL/)).toBeDefined();
  });

  it('quem não entrou vai para o login e volta para a mesma tela, com o bilhete', async () => {
    const auth = createFakeAuth();
    const history = createMemoryHistory({ initialEntries: ['/conectar#t=bilhete-9'] });
    render(
      <App
        client={auth.client}
        history={history}
        services={{ ...defaultServices, connectors: createFakeConnectors().api }}
      />,
    );
    await screen.findByRole('heading', { name: /Entrar/ });
    expect(history.location.pathname).toBe('/entrar');
    expect(decodeURIComponent(history.location.search)).toContain('/conectar#t=bilhete-9');
  });
});

describe('Configurações → Conectores', () => {
  it('lista o cliente, as permissões e o último uso, com o endereço para copiar', async () => {
    const fake = createFakeConnectors({
      connectors: [
        CONNECTOR,
        { ...CONNECTOR, id: 'g2', clientName: 'Codex', scopes: ['trama:read'], lastUsedAt: null },
      ],
    });
    renderAt('/configuracoes', fake);
    const section = within(await screen.findByRole('region', { name: 'Conectores' }));
    expect(await section.findByText('Codex')).toBeDefined();
    expect(section.getByText('https://mcp.exemplo/mcp')).toBeDefined();
    expect(section.getByText('Leitura e escrita · Último uso há 3 h')).toBeDefined();
    expect(section.getByText('Só leitura · Ainda não usado')).toBeDefined();
  });

  it('revogar pede confirmação e tira o cliente da lista', async () => {
    const fake = createFakeConnectors({ connectors: [CONNECTOR] });
    renderAt('/configuracoes', fake);
    const section = within(await screen.findByRole('region', { name: 'Conectores' }));
    fireEvent.click(await section.findByRole('button', { name: 'Revogar Claude' }));
    expect(fake.state.revoked).toEqual([]);
    fireEvent.click(section.getByRole('button', { name: 'Sim, revogar' }));
    await waitFor(() => expect(fake.state.revoked).toEqual(['g1']));
    expect(await section.findByText('Nenhum aplicativo conectado ainda.')).toBeDefined();
  });

  it('sem nenhum conector, diz isso; sem o conector ligado, a seção não aparece', async () => {
    renderAt('/configuracoes', createFakeConnectors());
    const section = within(await screen.findByRole('region', { name: 'Conectores' }));
    expect(await section.findByText('Nenhum aplicativo conectado ainda.')).toBeDefined();
    cleanup();
    renderAt('/configuracoes', null);
    await screen.findByRole('region', { name: 'Conta' });
    expect(screen.queryByRole('region', { name: 'Conectores' })).toBeNull();
  });
});

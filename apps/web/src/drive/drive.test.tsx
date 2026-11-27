import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { flowContentSchema, type FlowProject } from '@trama/core';
import { videoFlowExample } from '@trama/core/fixtures';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { ApiError } from '../api/projects-api';
import { defaultServices, type Services } from '../services';
import { createFakeAuth } from '../test/fake-auth';
import {
  connectedStatus,
  createFakeAccount,
  createFakeDrive,
  disconnectedStatus,
} from '../test/fake-drive';
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

beforeEach(() => localStorage.clear());
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

function renderAt(
  path: string,
  services: Partial<Services> = {},
  projects: FlowProject[] = [video],
) {
  const fake = createFakeProjects(projects);
  const auth = createFakeAuth();
  auth.addAccount('Ana Souza', 'ana@exemplo.com', 'senha-segura-1');
  auth.signInAs('ana@exemplo.com');
  const history = createMemoryHistory({ initialEntries: [path] });
  render(
    <App
      client={auth.client}
      history={history}
      services={{
        ...defaultServices,
        projects: fake.api,
        autosaveDelay: 10,
        driveCopyInterval: 60,
        ...services,
      }}
    />,
  );
  return { fake, history, auth };
}

const region = () => screen.findByRole('region', { name: 'Google Drive' });

describe('DriveConnect (cartão do Drive no Início)', () => {
  it('desconectado: oferece "Conectar" e leva ao Google com o caminho de volta', async () => {
    const drive = createFakeDrive(disconnectedStatus);
    const redirectTo = vi.fn();
    renderAt('/', { drive: drive.api, redirectTo });
    expect(await screen.findByText('Conectar ao Google Drive')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Conectar' }));
    await waitFor(() => expect(redirectTo).toHaveBeenCalledTimes(1));
    expect(redirectTo).toHaveBeenCalledWith('https://accounts.google.test/auth?volta=/');
    expect(drive.api.startConnect).toHaveBeenCalledWith('/');
  });

  it('conectado: mostra a conta, "Abrir pasta no Drive" e "Abrir do Drive"', async () => {
    const drive = createFakeDrive(connectedStatus);
    renderAt('/', { drive: drive.api, pickDriveFile: () => Promise.resolve(null) });
    const card = await region();
    expect(await screen.findByText('Google Drive conectado')).toBeDefined();
    expect(card.textContent).toContain('ana@gmail.example');
    expect(card.textContent).toContain('pasta “Trama”');
    const link = screen.getByRole('link', { name: 'Abrir pasta no Drive' });
    expect(link.getAttribute('href')).toBe('https://drive.google.com/drive/folders/pasta123');
    expect(link.getAttribute('rel')).toContain('noreferrer');
    expect(screen.getByRole('button', { name: 'Abrir do Drive' })).toHaveProperty(
      'disabled',
      false,
    );
  });

  it('desconectar pede confirmação e depois volta ao estado desconectado', async () => {
    const drive = createFakeDrive(connectedStatus);
    renderAt('/', { drive: drive.api });
    fireEvent.click(await screen.findByRole('button', { name: 'Desconectar' }));
    expect(drive.api.disconnect).not.toHaveBeenCalled();
    expect(screen.getByText(/Os arquivos continuam no seu Drive/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Sim, desconectar' }));
    expect(await screen.findByText('Conectar ao Google Drive')).toBeDefined();
    expect(drive.api.disconnect).toHaveBeenCalledTimes(1);
  });

  it('copia com falhas seguidas: avisa e oferece "Conectar de novo"', async () => {
    const drive = createFakeDrive({
      ...connectedStatus,
      consecutiveFailures: 3,
      lastError: 'O Google recusou o acesso ao seu Drive. Conecte o Drive de novo.',
    });
    renderAt('/', { drive: drive.api });
    expect(await screen.findByText('Google Drive com problema')).toBeDefined();
    expect(screen.getByRole('alert').textContent).toContain('Conecte o Drive de novo');
    expect(screen.getByRole('button', { name: 'Conectar de novo' })).toBeDefined();
  });

  it('sem as chaves do Google no ambiente, explica e não oferece conectar', async () => {
    const drive = createFakeDrive({ ...disconnectedStatus, available: false });
    renderAt('/', { drive: drive.api });
    expect(await screen.findByText(/ainda não está ligada neste ambiente/)).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Conectar' })).toBeNull();
  });

  it('sem a API do Trama, o cartão explica o que falta', async () => {
    renderAt('/', { drive: null });
    expect((await region()).textContent).toContain('precisa da API do Trama');
  });

  it('erro ao pedir o endereço do Google aparece no cartão', async () => {
    const drive = createFakeDrive(disconnectedStatus);
    drive.api.startConnect = vi.fn(() =>
      Promise.reject(new ApiError('O Drive ainda não está ligado neste ambiente.', 503)),
    );
    const redirectTo = vi.fn();
    renderAt('/', { drive: drive.api, redirectTo });
    fireEvent.click(await screen.findByRole('button', { name: 'Conectar' }));
    expect((await screen.findByRole('alert')).textContent).toContain('ainda não está ligado');
    expect(redirectTo).not.toHaveBeenCalled();
  });
});

describe('volta do Google (/drive/retorno)', () => {
  it('entrega o bilhete à API e volta para onde a pessoa estava', async () => {
    const drive = createFakeDrive(disconnectedStatus);
    const { history } = renderAt('/drive/retorno?volta=%2Fp%2Fabc#t=v1.iv.cifra', {
      drive: drive.api,
    });
    await waitFor(() => expect(drive.api.finishConnect).toHaveBeenCalledWith('v1.iv.cifra'));
    await waitFor(() => expect(history.location.pathname).toBe('/p/abc'));
  });

  it('só volta para caminhos do próprio site', async () => {
    const drive = createFakeDrive(disconnectedStatus);
    const { history } = renderAt('/drive/retorno?volta=%2F%2Fevil.example#t=bilhete', {
      drive: drive.api,
    });
    await waitFor(() => expect(drive.api.finishConnect).toHaveBeenCalled());
    await waitFor(() => expect(history.location.pathname).toBe('/'));
  });

  it('acesso negado no Google: explica e não chama a API', async () => {
    const drive = createFakeDrive(disconnectedStatus);
    renderAt('/drive/retorno?erro=negado', { drive: drive.api });
    expect((await screen.findByRole('alert')).textContent).toContain('não deu acesso');
    expect(drive.api.finishConnect).not.toHaveBeenCalled();
  });

  it('bilhete recusado pela API: mostra o erro e deixa voltar', async () => {
    const drive = createFakeDrive(disconnectedStatus);
    drive.api.finishConnect = vi.fn(() =>
      Promise.reject(new ApiError('A volta do Google venceu. Conecte o Drive de novo.', 400)),
    );
    renderAt('/drive/retorno#t=bilhete', { drive: drive.api });
    expect((await screen.findByRole('alert')).textContent).toContain('venceu');
    expect(screen.getByRole('link', { name: 'Voltar' })).toBeDefined();
  });
});

describe('quadro com o Drive conectado', () => {
  it('projeto já copiado mostra "Salvo no Drive" ao lado do "Salvo"', async () => {
    const drive = createFakeDrive(connectedStatus);
    renderAt(`/p/${video.id}`, { drive: drive.api }, [{ ...video, driveFileId: 'arquivo' }]);
    expect(await screen.findByText('Salvo no Drive')).toBeDefined();
    expect(screen.getByText('Salvo')).toBeDefined();
    expect(drive.api.copyProject).not.toHaveBeenCalled();
  });

  it('depois de uma mudança, salva no Trama e só então copia para o Drive', async () => {
    const drive = createFakeDrive(connectedStatus);
    const { fake } = renderAt(`/p/${video.id}`, { drive: drive.api }, [
      { ...video, driveFileId: 'arquivo' },
    ]);
    await screen.findByText('Salvo no Drive');
    fireEvent.click(await screen.findByRole('checkbox', { name: /Vídeo pronto/ }));
    await waitFor(() => expect(drive.api.copyProject).toHaveBeenCalledTimes(1));
    // A cópia veio depois de o Trama gravar a mudança.
    expect(fake.saves).toHaveLength(1);
    expect(drive.api.copyProject).toHaveBeenCalledWith(video.id, { keepalive: false });
    expect(await screen.findByText('Salvo no Drive')).toBeDefined();
  });

  it('projeto que ainda não está no Drive é copiado logo ao abrir', async () => {
    const drive = createFakeDrive(connectedStatus);
    renderAt(`/p/${video.id}`, { drive: drive.api });
    await waitFor(() => expect(drive.api.copyProject).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Salvo no Drive')).toBeDefined();
  });

  it('cópia que falha mostra "Drive não copiou" e tenta de novo sozinha', async () => {
    const drive = createFakeDrive(connectedStatus);
    drive.failNextCopies(1);
    renderAt(`/p/${video.id}`, { drive: drive.api });
    expect(await screen.findByText('Drive não copiou')).toBeDefined();
    expect(screen.getByText('Salvo')).toBeDefined();
    expect(await screen.findByText('Salvo no Drive')).toBeDefined();
    expect(drive.api.copyProject).toHaveBeenCalledTimes(2);
  });

  it('sem o Drive conectado, o quadro só mostra o "Salvo"', async () => {
    const drive = createFakeDrive(disconnectedStatus);
    renderAt(`/p/${video.id}`, { drive: drive.api });
    await screen.findByText('Salvo');
    await waitFor(() => expect(drive.api.status).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole('checkbox', { name: /Vídeo pronto/ }));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(drive.api.copyProject).not.toHaveBeenCalled();
    expect(screen.queryByText(/Drive/)).toBeNull();
  });
});

describe('Abrir do Drive', () => {
  it('abre o seletor com o token da API, importa o arquivo e abre o projeto', async () => {
    const drive = createFakeDrive(connectedStatus);
    drive.importAs(video.id);
    const pick = vi.fn(() => Promise.resolve('arquivoEscolhido123'));
    const { history } = renderAt('/', { drive: drive.api, pickDriveFile: pick });
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir do Drive' }));
    await waitFor(() => expect(history.location.pathname).toBe(`/p/${video.id}`));
    expect(pick).toHaveBeenCalledWith({ accessToken: 'token-do-picker' });
    expect(drive.api.importFile).toHaveBeenCalledWith('arquivoEscolhido123');
  });

  it('se a pessoa cancela o seletor, nada é importado', async () => {
    const drive = createFakeDrive(connectedStatus);
    const pick = vi.fn(() => Promise.resolve(null));
    const { history } = renderAt('/', { drive: drive.api, pickDriveFile: pick });
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir do Drive' }));
    await waitFor(() => expect(pick).toHaveBeenCalled());
    expect(drive.api.importFile).not.toHaveBeenCalled();
    expect(history.location.pathname).toBe('/');
  });

  it('arquivo que não é um projeto do Trama mostra o erro da API', async () => {
    const drive = createFakeDrive(connectedStatus);
    const pick = vi.fn(() => Promise.resolve('arquivoEscolhido123'));
    renderAt('/', { drive: drive.api, pickDriveFile: pick });
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir do Drive' }));
    expect((await screen.findByRole('alert')).textContent).toContain('não é um projeto do Trama');
  });

  it('sem o seletor configurado, o botão fica desligado', async () => {
    const drive = createFakeDrive(connectedStatus);
    renderAt('/', { drive: drive.api, pickDriveFile: null });
    expect(await screen.findByRole('button', { name: 'Abrir do Drive' })).toHaveProperty(
      'disabled',
      true,
    );
  });
});

describe('e-mail de boas-vindas', () => {
  it('pede ao entrar, uma vez por navegador', async () => {
    const account = createFakeAccount();
    renderAt('/', { account: account.api });
    await waitFor(() => expect(account.sendWelcome).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(localStorage.getItem('trama:welcome:u1')).toBe('1'));
    cleanup();
    renderAt('/', { account: account.api });
    await screen.findByRole('heading', { level: 1 });
    expect(account.sendWelcome).toHaveBeenCalledTimes(1);
  });

  it('falha no envio não atrapalha a tela e tenta de novo na próxima carga', async () => {
    const account = createFakeAccount({ fail: true });
    renderAt('/', { account: account.api });
    expect(await screen.findByRole('heading', { level: 1 })).toBeDefined();
    await waitFor(() => expect(account.sendWelcome).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem('trama:welcome:u1')).toBeNull();
  });
});

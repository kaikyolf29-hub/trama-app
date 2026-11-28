import { createMemoryHistory } from '@tanstack/react-router';
import { createEmptyFlow, type FlowProject } from '@trama/core';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { defaultServices } from '../services';
import { createFakeAuth } from '../test/fake-auth';
import {
  createFakeRecorder,
  createFakeTranscriber,
  createFakeVoiceServices,
  type FakeTranscriberOptions,
} from '../test/fake-voice';
import { createFakeProjects } from '../test/fake-projects';

afterEach(cleanup);

const project: FlowProject = {
  id: '6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f',
  kind: 'flow',
  title: 'Ideia do jogo',
  status: 'draft',
  revision: 1,
  driveFileId: null,
  createdAt: '2026-11-27T10:00:00.000Z',
  updatedAt: '2026-11-27T10:00:00.000Z',
  content: createEmptyFlow(),
};

function renderVoice(
  options: { transcriber?: FakeTranscriberOptions; device?: 'webgpu' | 'wasm' } = {},
) {
  const recorder = createFakeRecorder();
  const transcriber = createFakeTranscriber(options.transcriber);
  const { services: voice } = createFakeVoiceServices(recorder, transcriber, options.device);
  const auth = createFakeAuth();
  auth.addAccount('Ana Souza', 'ana@exemplo.com', 'senha-segura-1');
  auth.signInAs('ana@exemplo.com');
  const history = createMemoryHistory({ initialEntries: [`/p/${project.id}/falar`] });
  render(
    <App
      client={auth.client}
      history={history}
      services={{ ...defaultServices, projects: createFakeProjects([project]).api, voice }}
    />,
  );
  return { recorder, transcriber, history };
}

const record = () => screen.findByRole('button', { name: 'Gravar' });
const textbox = () => screen.getByRole<HTMLTextAreaElement>('textbox', { name: /Transcrição/ });

describe('tela Falar e organizar', () => {
  it('mostra o cabeçalho da tela 5, com o título do projeto e as escolhas', async () => {
    renderVoice();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Falar e organizar' }),
    ).toBeDefined();
    expect(screen.getByRole('link', { name: 'Ideia do jogo' }).getAttribute('href')).toBe(
      `/p/${project.id}`,
    );
    const model = screen.getByLabelText<HTMLSelectElement>('Transcrição');
    expect([...model.options].map((o) => o.text)).toEqual([
      'Whisper local · grátis',
      'Whisper local · mais preciso',
    ]);
    expect(screen.getByLabelText<HTMLSelectElement>('Organizar com').disabled).toBe(true);
  });

  it('o formato e a organização ficam na tela, desligados, e dizem que chegam na próxima etapa', async () => {
    renderVoice();
    await record();
    const formats = ['Fluxo', 'Roteiro', 'Plano com tarefas', 'Prompt organizado'];
    for (const name of formats) {
      expect(screen.getByRole<HTMLButtonElement>('button', { name }).disabled).toBe(true);
    }
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Inserir no quadro' }).disabled,
    ).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Refazer' }).disabled).toBe(true);
    expect(screen.getByText('A organização pela IA chega na próxima etapa')).toBeDefined();
  });

  it('grava, mostra o tempo, para e o texto aparece e pode ser corrigido', async () => {
    const { recorder, transcriber } = renderVoice({
      transcriber: { texts: ['o personagem é uma raposa'] },
    });
    fireEvent.click(await record());
    expect(await screen.findByText(/^Gravando · 00:00/)).toBeDefined();
    act(() => recorder.speak(3));
    expect(screen.getByText('Gravando · 00:03')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Parar de gravar' }));
    await waitFor(() => expect(textbox().value).toBe('o personagem é uma raposa'));
    expect(transcriber.transcribe).toHaveBeenCalledTimes(1);
    await screen.findByText('Pronto para gravar');

    fireEvent.change(textbox(), { target: { value: 'o personagem é um gato' } });
    expect(textbox().value).toBe('o personagem é um gato');
  });

  it('uma nova gravação entra no fim do texto, sem apagar a correção', async () => {
    const { recorder } = renderVoice({
      transcriber: { texts: ['primeira parte', 'segunda parte'] },
    });
    fireEvent.click(await record());
    await screen.findByText(/^Gravando/);
    act(() => recorder.speak(2));
    fireEvent.click(screen.getByRole('button', { name: 'Parar de gravar' }));
    await waitFor(() => expect(textbox().value).toBe('primeira parte'));

    fireEvent.change(textbox(), { target: { value: 'Primeira parte corrigida.' } });
    fireEvent.click(await record());
    await screen.findByText(/^Gravando/);
    act(() => recorder.speak(2));
    fireEvent.click(screen.getByRole('button', { name: 'Parar de gravar' }));
    await waitFor(() => expect(textbox().value).toBe('Primeira parte corrigida. segunda parte'));
  });

  it('o aviso de download diz a porcentagem', async () => {
    const recorder = createFakeRecorder();
    let finish: (value: { device: 'webgpu' }) => void = () => undefined;
    const transcriber = createFakeTranscriber();
    transcriber.load.mockImplementation((options) => {
      options.onProgress(45);
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const { services: voice } = createFakeVoiceServices(recorder, transcriber);
    const auth = createFakeAuth();
    auth.addAccount('Ana Souza', 'ana@exemplo.com', 'senha-segura-1');
    auth.signInAs('ana@exemplo.com');
    render(
      <App
        client={auth.client}
        history={createMemoryHistory({ initialEntries: [`/p/${project.id}/falar`] })}
        services={{ ...defaultServices, projects: createFakeProjects([project]).api, voice }}
      />,
    );
    fireEvent.click(await record());
    expect(
      await screen.findByText('Baixando o modelo de voz, só na primeira vez: 45%'),
    ).toBeDefined();
    expect(screen.getByRole('progressbar', { name: 'Download do modelo de voz' })).toBeDefined();
    await act(() => {
      finish({ device: 'webgpu' });
      return Promise.resolve();
    });
    await waitFor(() => expect(screen.queryByText(/Baixando o modelo/)).toBeNull());
  });

  it('permissão negada explica como liberar e deixa tentar de novo', async () => {
    const { recorder } = renderVoice();
    recorder.failNextStart('denied');
    fireEvent.click(await record());
    expect((await screen.findByRole('alert')).textContent).toMatch(/cadeado/);
    recorder.clearFailure();
    fireEvent.click(screen.getByRole('button', { name: 'Gravar' }));
    expect(await screen.findByText(/^Gravando/)).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('sem microfone, avisa', async () => {
    const { recorder } = renderVoice();
    recorder.failNextStart('no-device');
    fireEvent.click(await record());
    expect((await screen.findByRole('alert')).textContent).toMatch(/Não encontramos um microfone/);
  });

  it('avisa que vai ficar lento quando só há WASM, e não avisa com WebGPU', async () => {
    cleanup();
    renderVoice({ device: 'wasm' });
    expect(await screen.findByText(/fica mais lenta/)).toBeDefined();
    cleanup();
    renderVoice({ device: 'webgpu' });
    await record();
    expect(screen.queryByText(/fica mais lenta/)).toBeNull();
  });

  it('o modelo "mais preciso" cria um novo transcritor com o modelo certo', async () => {
    const { transcriber, recorder } = renderVoice();
    await record();
    fireEvent.change(screen.getByLabelText('Transcrição'), { target: { value: 'small' } });
    fireEvent.click(await record());
    await screen.findByText(/^Gravando/);
    act(() => recorder.speak(2));
    await waitFor(() =>
      expect(transcriber.load).toHaveBeenCalledWith(expect.objectContaining({ model: 'small' })),
    );
  });

  it('"Copiar texto" fica desligado sem texto e copia o que está na caixa', async () => {
    const write = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: write },
      configurable: true,
    });
    renderVoice();
    await record();
    const copy = screen.getByRole<HTMLButtonElement>('button', { name: 'Copiar texto' });
    expect(copy.disabled).toBe(true);
    fireEvent.change(textbox(), { target: { value: 'um texto corrigido' } });
    expect(copy.disabled).toBe(false);
    fireEvent.click(copy);
    await waitFor(() => expect(write).toHaveBeenCalledWith('um texto corrigido'));
    expect(await screen.findByText('Copiado')).toBeDefined();
  });

  it('sem a API de projetos, explica o que falta', async () => {
    const auth = createFakeAuth();
    auth.addAccount('Ana Souza', 'ana@exemplo.com', 'senha-segura-1');
    auth.signInAs('ana@exemplo.com');
    render(
      <App
        client={auth.client}
        history={createMemoryHistory({ initialEntries: [`/p/${project.id}/falar`] })}
        services={{ ...defaultServices, projects: null }}
      />,
    );
    expect(await screen.findByText(/VITE_API_URL/)).toBeDefined();
  });

  it('quem não está logado vai para a entrada', async () => {
    const auth = createFakeAuth();
    const history = createMemoryHistory({ initialEntries: [`/p/${project.id}/falar`] });
    render(
      <App
        client={auth.client}
        history={history}
        services={{ ...defaultServices, projects: createFakeProjects([project]).api }}
      />,
    );
    await waitFor(() => expect(history.location.pathname).toBe('/entrar'));
  });
});

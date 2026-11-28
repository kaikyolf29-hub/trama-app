import { createMemoryHistory } from '@tanstack/react-router';
import {
  createEmptyFlow,
  flowContentSchema,
  type AiKeySummary,
  type AiSettings,
  type FlowProject,
} from '@trama/core';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { defaultServices } from '../services';
import { createFakeAi } from '../test/fake-ai';
import { createFakeAuth } from '../test/fake-auth';
import { createFakeProjects } from '../test/fake-projects';
import { createFakeVoiceServices } from '../test/fake-voice';

afterEach(cleanup);

const SETTINGS: AiSettings = {
  provider: 'anthropic',
  model: 'claude-haiku-5-5',
  effort: 'balanced',
};
const KEY: AiKeySummary = {
  provider: 'anthropic',
  last4: '1234',
  savedAt: '2026-11-27T12:00:00.000Z',
};
const SPEECH = 'o jogo é de plataforma, o personagem é uma raposa, não, um gato sem memória';

const project: FlowProject = {
  id: '6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f',
  kind: 'flow',
  title: 'Sem título',
  status: 'draft',
  revision: 3,
  driveFileId: null,
  createdAt: '2026-11-27T10:00:00.000Z',
  updatedAt: '2026-11-27T10:00:00.000Z',
  content: createEmptyFlow(),
};

function renderVoice(
  options: {
    settings?: AiSettings | null;
    keys?: AiKeySummary[];
    project?: FlowProject;
  } = {},
) {
  const ai = createFakeAi({
    settings: options.settings === undefined ? SETTINGS : options.settings,
    keys: options.keys ?? [KEY],
  });
  const projects = createFakeProjects([options.project ?? project]);
  const { services: voice } = createFakeVoiceServices();
  const auth = createFakeAuth();
  auth.addAccount('Ana Souza', 'ana@exemplo.com', 'senha-segura-1');
  auth.signInAs('ana@exemplo.com');
  const history = createMemoryHistory({ initialEntries: [`/p/${project.id}/falar`] });
  render(
    <App
      client={auth.client}
      history={history}
      services={{
        ...defaultServices,
        projects: projects.api,
        ai: ai.api,
        voice,
        aiEstimateDelay: 0,
      }}
    />,
  );
  return { ai, projects, history };
}

const textbox = () => screen.findByRole<HTMLTextAreaElement>('textbox', { name: /Transcrição/ });
const organizeButton = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Organizar' });

async function speak(text = SPEECH) {
  fireEvent.change(await textbox(), { target: { value: text } });
}

/** Escreve o texto e espera a tela saber que a IA está pronta (Organizar liga). */
async function readyToOrganize(text = SPEECH) {
  await speak(text);
  await waitFor(() => expect(organizeButton().disabled).toBe(false));
}

async function organize() {
  await readyToOrganize();
  fireEvent.click(organizeButton());
}

describe('Falar e organizar: a IA escolhida', () => {
  it('mostra o provedor e o modelo das Configurações, com link para lá', async () => {
    renderVoice();
    const link = await screen.findByRole('link', { name: 'Claude · claude-haiku-5-5' });
    expect(link.getAttribute('href')).toBe('/configuracoes');
    expect(link.getAttribute('title')).toMatch(/Esforço equilibrado/);
  });

  it('sem chave guardada: avisa, liga o link para Configurações e não deixa organizar', async () => {
    renderVoice({ keys: [] });
    expect(await screen.findByText('Falta a chave do Claude')).toBeDefined();
    const links = screen.getAllByRole('link', { name: /Guardar a chave/ });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link.getAttribute('href')).toBe('/configuracoes');
    await speak();
    expect(organizeButton().disabled).toBe(true);
  });

  it('sem escolha de provedor: pede para configurar', async () => {
    renderVoice({ settings: null, keys: [] });
    expect(await screen.findByText('Escolha a IA que vai organizar')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Abrir Configurações' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Configurar a IA' })).toBeDefined();
  });
});

describe('Falar e organizar: estimativa de custo', () => {
  it('aparece antes de enviar, com tokens e custo, e acompanha o formato', async () => {
    const { ai } = renderVoice();
    await speak();
    expect(
      await screen.findByText(
        /Estimativa antes de enviar: cerca de 900 tokens para enviar e 1\.500 de resposta, uns US\$\s0,01 na sua conta do Claude/,
      ),
    ).toBeDefined();
    expect(ai.state.estimates.at(-1)).toEqual({ text: SPEECH, format: 'flow' });
    expect(ai.state.organized).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Prompt organizado' }));
    await waitFor(() => expect(ai.state.estimates.at(-1)?.format).toBe('prompt'));
  });

  it('sem preço conhecido, mostra só os tokens', async () => {
    const { ai } = renderVoice();
    ai.state.estimate = { ...ai.state.estimate, provider: 'google', costUsd: null };
    await speak();
    expect(await screen.findByText(/não sabe o preço deste modelo/)).toBeDefined();
  });

  it('não estima sem texto, e se a estimativa falha diz o motivo sem travar o resto', async () => {
    const { ai } = renderVoice();
    await textbox();
    await screen.findByRole('link', { name: /Claude/ });
    expect(ai.state.estimates).toEqual([]);
    ai.state.estimateFailure = { message: 'O provedor está fora do ar.' };
    await speak();
    expect(await screen.findByText(/Não deu para estimar o custo: O provedor/)).toBeDefined();
    await waitFor(() => expect(organizeButton().disabled).toBe(false));
  });

  it('texto grande demais não vai à API e explica', async () => {
    const { ai } = renderVoice();
    await screen.findByRole('link', { name: /Claude/ });
    await speak('a'.repeat(20_001));
    expect(await screen.findByText(/Use no máximo 20\.000 caracteres/)).toBeDefined();
    expect(ai.state.estimates).toEqual([]);
  });
});

describe('Falar e organizar: organizar', () => {
  it('mostra o carregando e depois o resultado, com a pré-visualização e as correções', async () => {
    const { ai } = renderVoice();
    let release: () => void = () => undefined;
    ai.state.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    await organize();
    expect(await screen.findByText('Organizando com Claude…')).toBeDefined();
    expect(organizeButton().disabled).toBe(true);
    expect(ai.state.organized).toEqual([{ text: SPEECH, format: 'flow' }]);

    await act(async () => {
      release();
      await Promise.resolve();
    });
    const result = await screen.findByTestId('result');
    const preview = within(result).getByTestId('flow-preview');
    for (const title of ['HISTÓRIA', 'Gato perdeu a memória', 'Chefe final: o dono']) {
      // Os títulos das molduras vêm em maiúsculas pelo estilo, mas o texto é o da saída da IA.
      expect(preview.textContent?.toUpperCase()).toContain(title.toUpperCase());
    }
    expect(preview.getAttribute('aria-label')).toBe(
      'Pré-visualização do fluxo: 8 blocos, 3 molduras e 3 setas',
    );
    const corrections = screen.getByRole('region', { name: 'Correções que a IA percebeu' });
    expect(corrections.textContent).toContain('Você trocou “raposa” por “gato”');
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Inserir no quadro' }).disabled,
    ).toBe(false);
  });

  it('o formato escolhido vai no pedido', async () => {
    const { ai } = renderVoice();
    fireEvent.click(await screen.findByRole('button', { name: 'Plano com tarefas' }));
    expect(
      screen.getByRole('button', { name: 'Plano com tarefas' }).getAttribute('aria-pressed'),
    ).toBe('true');
    await organize();
    await screen.findByTestId('result');
    expect(ai.state.organized).toEqual([{ text: SPEECH, format: 'plan' }]);
  });

  it('"Refazer" organiza de novo, e mudar o texto avisa que o resultado ficou velho', async () => {
    const { ai } = renderVoice();
    await organize();
    await screen.findByTestId('result');
    fireEvent.change(await textbox(), { target: { value: `${SPEECH} E tem um chefe final.` } });
    expect(await screen.findByText(/mudou depois desta organização/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Refazer' }));
    await waitFor(() => expect(ai.state.organized).toHaveLength(2));
    expect(ai.state.organized[1]?.text).toBe(`${SPEECH} E tem um chefe final.`);
    await waitFor(() => expect(screen.queryByText(/mudou depois desta organização/)).toBeNull());
  });

  it.each([
    ['key_rejected', 'O Claude recusou a chave. Confira se ela está ativa.', true, false],
    ['provider_rate_limited', 'O Claude pediu para esperar: limite de uso.', false, true],
    ['refused', 'O Claude não quis responder a este texto.', false, false],
    ['truncated', 'A resposta ficou grande demais e veio cortada.', false, true],
    ['bad_output', 'A IA respondeu fora do formato esperado.', false, true],
  ] as const)(
    'erro %s: mostra a frase da API e o botão certo',
    async (code, message, settings, retry) => {
      const { ai } = renderVoice();
      ai.state.organizeFailures.push({ message, code });
      await organize();
      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toBe(message);
      expect(screen.queryByRole('link', { name: 'Abrir Configurações' }) !== null).toBe(settings);
      expect(screen.queryByRole('button', { name: 'Tentar de novo' }) !== null).toBe(retry);
    },
  );

  it('"Tentar de novo" depois de um limite de uso organiza e mostra o resultado', async () => {
    const { ai } = renderVoice();
    ai.state.organizeFailures.push({ message: 'Espere um pouco.', code: 'provider_rate_limited' });
    await organize();
    fireEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByTestId('result')).toBeDefined();
    expect(ai.state.organized).toHaveLength(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Falar e organizar: inserir', () => {
  it('fluxo: junta ao quadro abaixo do que já existe, grava com a revisão certa e abre o quadro', async () => {
    const { projects, history } = renderVoice();
    await organize();
    await screen.findByTestId('result');
    fireEvent.click(screen.getByRole('button', { name: 'Inserir no quadro' }));
    await waitFor(() => expect(history.location.pathname).toBe(`/p/${project.id}`));

    expect(projects.saves).toHaveLength(1);
    const { request } = projects.saves[0]!;
    expect(request.baseRevision).toBe(3);
    const content = flowContentSchema.parse(request.content);
    expect(content.blocks).toHaveLength(8);
    expect(content.frames.map((frame) => frame.title)).toEqual([
      'História',
      'Mecânicas',
      'A decidir',
    ]);
    expect(content.arrows).toHaveLength(3);
    // O título "Sem título" ganha o nome que a IA sugeriu.
    expect(request.title).toBe('O gato sem memória');
  });

  it('não renomeia um projeto que já tem nome e põe o novo abaixo do que existia', async () => {
    const existing = createEmptyFlow();
    existing.blocks.push({
      id: 'velho',
      type: 'sticky',
      position: { x: 40, y: 40 },
      size: { width: 160, height: 152 },
      text: 'Já estava aqui',
      color: 'yellow',
      locked: false,
      zIndex: 0,
    });
    const { projects, history } = renderVoice({
      project: { ...project, title: 'Ideia do jogo', content: existing },
    });
    await organize();
    await screen.findByTestId('result');
    fireEvent.click(screen.getByRole('button', { name: 'Inserir no quadro' }));
    await waitFor(() => expect(history.location.pathname).toBe(`/p/${project.id}`));
    const { request } = projects.saves[0]!;
    expect(request.title).toBeUndefined();
    const content = flowContentSchema.parse(request.content);
    expect(content.blocks[0]?.id).toBe('velho');
    const old = content.blocks[0]!;
    for (const added of content.blocks.slice(1)) {
      expect(added.position.y).toBeGreaterThanOrEqual(old.position.y + old.size.height);
    }
  });

  it('se gravar falha, mostra o erro, não sai da tela e deixa tentar de novo', async () => {
    const { projects, history } = renderVoice();
    await organize();
    await screen.findByTestId('result');
    projects.failNextSave('Sem conexão com o Trama.');
    fireEvent.click(screen.getByRole('button', { name: 'Inserir no quadro' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Sem conexão com o Trama.');
    expect(history.location.pathname).toBe(`/p/${project.id}/falar`);
    fireEvent.click(screen.getByRole('button', { name: 'Inserir no quadro' }));
    await waitFor(() => expect(history.location.pathname).toBe(`/p/${project.id}`));
  });

  it('roteiro: mostra as cenas e "Criar roteiro" cria um projeto roteiro com elas', async () => {
    const { projects, ai } = renderVoice();
    fireEvent.click(await screen.findByRole('button', { name: 'Roteiro' }));
    await organize();
    const preview = await screen.findByTestId('script-preview');
    expect(within(preview).getByText('Gancho')).toBeDefined();
    expect(within(preview).getByText(/Gato na janela · Close nos olhos do gato/)).toBeDefined();
    expect(ai.state.organized[0]?.format).toBe('script');

    fireEvent.click(screen.getByRole('button', { name: 'Criar roteiro' }));
    expect(
      await screen.findByText(/Roteiro “O gato sem memória: apresentando o jogo” criado/),
    ).toBeDefined();
    expect(projects.scripts).toHaveLength(1);
    expect(projects.scripts[0]).toMatchObject({
      kind: 'script',
      title: 'O gato sem memória: apresentando o jogo',
    });
    expect(projects.scripts[0]?.content.scenes.map((scene) => scene.title)).toEqual([
      'Gancho',
      'A história',
    ]);
    expect(projects.saves).toEqual([]);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Criar roteiro' }).disabled).toBe(
      true,
    );
  });

  it('prompt: mostra as seções e "Copiar prompt" copia o texto inteiro', async () => {
    const write = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: write },
      configurable: true,
    });
    renderVoice();
    fireEvent.click(await screen.findByRole('button', { name: 'Prompt organizado' }));
    await organize();
    const result = await screen.findByTestId('result');
    expect(within(result).getByText('Objetivo')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Copiar prompt' }));
    await waitFor(() =>
      expect(write).toHaveBeenCalledWith(
        '## Objetivo\n\nEscrever o roteiro de um vídeo de culinária.\n\n## Contexto\n\nCanal de receitas rápidas, tom leve.',
      ),
    );
    expect(await screen.findByText('Prompt copiado.')).toBeDefined();
  });
});

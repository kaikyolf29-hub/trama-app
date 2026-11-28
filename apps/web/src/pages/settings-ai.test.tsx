import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { defaultServices } from '../services';
import { createFakeAccount } from '../test/fake-account';
import { createFakeAi } from '../test/fake-ai';
import { createFakeAuth } from '../test/fake-auth';
import { createFakeProjects } from '../test/fake-projects';

afterEach(cleanup);

const SAVED_KEY = {
  provider: 'anthropic',
  last4: '1234',
  savedAt: '2026-11-27T12:00:00.000Z',
} as const;

function renderAi(options: Parameters<typeof createFakeAi>[0] = {}) {
  const auth = createFakeAuth();
  auth.addAccount('Ana Souza', 'ana@exemplo.com', 'senha-segura-1');
  auth.signInAs('ana@exemplo.com');
  const ai = createFakeAi(options);
  render(
    <App
      client={auth.client}
      history={createMemoryHistory({ initialEntries: ['/configuracoes'] })}
      services={{
        ...defaultServices,
        projects: createFakeProjects([]).api,
        account: createFakeAccount().api,
        ai: ai.api,
      }}
    />,
  );
  return ai;
}

/** A seção "IA", já carregada (o formulário aparece depois das chamadas à API). */
async function aiSection() {
  const region = await screen.findByRole('region', { name: 'IA' });
  await within(region).findByRole('radio', { name: /Claude/ });
  return within(region);
}

const paste = (scope: Pick<typeof screen, 'getByLabelText'>, value: string) =>
  fireEvent.change(scope.getByLabelText('Chave da API'), { target: { value } });

describe('Configurações: IA', () => {
  it('sem nada guardado: três provedores sem chave, modelos desligados e esforço Equilibrado', async () => {
    renderAi();
    const ia = await aiSection();
    expect(ia.getAllByRole('radio').map((r) => r.getAttribute('value'))).toEqual([
      'anthropic',
      'google',
      'openai',
      'fast',
      'balanced',
      'thorough',
    ]);
    expect(ia.getAllByText('Sem chave')).toHaveLength(3);
    expect(ia.getByLabelText('Chave da API')).toHaveProperty('type', 'password');
    expect(ia.getByLabelText('Modelo')).toHaveProperty('disabled', true);
    expect(ia.getByRole('radio', { name: 'Equilibrado' })).toHaveProperty('checked', true);
    expect(ia.getByText(/pensa um pouco antes de responder/)).toBeDefined();
    expect(screen.getByText(/fica cifrada no servidor/)).toBeDefined();
    expect(screen.getByText(/cobrado pelo provedor, na sua conta/)).toBeDefined();
  });

  it('guarda a chave, mostra só "termina em" e escolhe o modelo sugerido', async () => {
    const ai = renderAi();
    const ia = await aiSection();
    paste(ia, '  sk-ant-api03-segredo-9876  ');
    fireEvent.click(ia.getByRole('button', { name: 'Guardar chave' }));

    expect(await ia.findByText(/termina em/)).toBeDefined();
    expect(ia.getByText('9876')).toBeDefined();
    expect(ia.queryByLabelText('Chave da API')).toBeNull();
    // A chave foi enviada sem espaços nas pontas e não aparece em lugar nenhum da tela.
    expect(ai.state.sent).toEqual([{ provider: 'anthropic', apiKey: 'sk-ant-api03-segredo-9876' }]);
    expect(document.body.textContent).not.toContain('segredo');
    expect(ia.getByText('Chave guardada')).toBeDefined();

    // Os modelos vêm da API; sem escolha anterior, o Trama pega o Haiku e salva.
    const select = await ia.findByLabelText<HTMLSelectElement>('Modelo');
    await waitFor(() => expect(select.value).toBe('claude-haiku-5-5'));
    expect(within(select).getByText('Claude Haiku 5.5 · Para o dia a dia')).toBeDefined();
    expect(within(select).getByText('Claude Opus 5.5 · O máximo de qualidade')).toBeDefined();
    await waitFor(() =>
      expect(ai.state.saved).toEqual([
        { provider: 'anthropic', model: 'claude-haiku-5-5', effort: 'balanced' },
      ]),
    );
    expect(await ia.findByText('Salvo')).toBeDefined();
  });

  it('chave recusada pelo provedor: avisa e não mostra "termina em"', async () => {
    const ai = renderAi();
    ai.state.rejected.add('sk-ant-errada-0000');
    const ia = await aiSection();
    paste(ia, 'sk-ant-errada-0000');
    fireEvent.click(ia.getByRole('button', { name: 'Guardar chave' }));
    expect(await ia.findByText('Chave recusada pelo provedor')).toBeDefined();
    expect(ia.getByText(/O provedor recusou a chave/)).toBeDefined();
    expect(ia.queryByText(/termina em/)).toBeNull();
    expect(ia.getByLabelText('Chave da API')).toBeDefined();
    expect(ai.state.keys.size).toBe(0);
  });

  it('campo vazio não chama a API', async () => {
    const ai = renderAi();
    const ia = await aiSection();
    fireEvent.click(ia.getByRole('button', { name: 'Guardar chave' }));
    expect(await ia.findByText('Cole a chave do provedor.')).toBeDefined();
    expect(ai.state.sent).toEqual([]);
  });

  it('erro de rede ao guardar mostra a frase da API', async () => {
    const ai = renderAi();
    const ia = await aiSection();
    ai.state.failNext = { message: 'Sem conexão com o Trama. Confira a internet.' };
    paste(ia, 'sk-ant-api03-qualquer-1111');
    fireEvent.click(ia.getByRole('button', { name: 'Guardar chave' }));
    expect(await ia.findByText(/Sem conexão com o Trama/)).toBeDefined();
    expect(ia.queryByText('Chave recusada pelo provedor')).toBeNull();
  });

  it('mostra a chave que já existe e deixa trocar e cancelar', async () => {
    const ai = renderAi({
      settings: { provider: 'anthropic', model: 'claude-sonnet-5-5', effort: 'thorough' },
      keys: [SAVED_KEY],
    });
    const ia = await aiSection();
    expect(await ia.findByText('1234')).toBeDefined();
    expect(ia.getByRole('radio', { name: 'Caprichado' })).toHaveProperty('checked', true);
    expect((await ia.findByLabelText<HTMLSelectElement>('Modelo')).value).toBe('claude-sonnet-5-5');
    // Já tinha modelo escolhido: abrir a tela não salva nada.
    expect(ai.state.saved).toEqual([]);

    fireEvent.click(ia.getByRole('button', { name: 'Trocar' }));
    expect(ia.getByLabelText('Chave da API')).toHaveProperty('value', '');
    fireEvent.click(ia.getByRole('button', { name: 'Cancelar' }));
    expect(ia.queryByLabelText('Chave da API')).toBeNull();

    fireEvent.click(ia.getByRole('button', { name: 'Trocar' }));
    paste(ia, 'sk-ant-api03-nova-chave-5555');
    fireEvent.click(ia.getByRole('button', { name: 'Guardar chave' }));
    expect(await ia.findByText('5555')).toBeDefined();
    expect(ai.state.keys.get('anthropic')?.last4).toBe('5555');
    // O modelo escolhido continua.
    expect((await ia.findByLabelText<HTMLSelectElement>('Modelo')).value).toBe('claude-sonnet-5-5');
  });

  it('apagar pede confirmação e depois volta ao campo da chave', async () => {
    const ai = renderAi({ keys: [SAVED_KEY] });
    const ia = await aiSection();
    fireEvent.click(await ia.findByRole('button', { name: 'Apagar' }));
    expect(ia.getByText('Apagar esta chave?')).toBeDefined();
    fireEvent.click(ia.getByRole('button', { name: 'Cancelar' }));
    expect(ai.state.deleted).toEqual([]);

    fireEvent.click(ia.getByRole('button', { name: 'Apagar' }));
    fireEvent.click(ia.getByRole('button', { name: 'Sim, apagar' }));
    expect(await ia.findByLabelText('Chave da API')).toBeDefined();
    expect(ai.state.deleted).toEqual(['anthropic']);
    expect(ia.getByLabelText('Modelo')).toHaveProperty('disabled', true);
    expect(ia.getAllByText('Sem chave')).toHaveLength(3);
  });

  it('escolher o modelo e o esforço salva na hora', async () => {
    const ai = renderAi({
      settings: { provider: 'anthropic', model: 'claude-haiku-5-5', effort: 'balanced' },
      keys: [SAVED_KEY],
    });
    const ia = await aiSection();
    const select = await ia.findByLabelText<HTMLSelectElement>('Modelo');
    fireEvent.change(select, { target: { value: 'claude-opus-5-5' } });
    await waitFor(() => expect(ai.state.saved).toHaveLength(1));
    expect(ai.state.saved[0]).toEqual({
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      effort: 'balanced',
    });

    fireEvent.click(ia.getByRole('radio', { name: 'Rápido' }));
    await waitFor(() => expect(ai.state.saved).toHaveLength(2));
    expect(ai.state.saved[1]).toEqual({
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      effort: 'fast',
    });
    expect(ia.getByText(/Responde logo e gasta menos/)).toBeDefined();
    expect(await ia.findByText('Salvo')).toBeDefined();
  });

  it('trocar de provedor mostra a chave e os modelos dele, sem levar o modelo do outro', async () => {
    const ai = renderAi({
      settings: { provider: 'anthropic', model: 'claude-haiku-5-5', effort: 'fast' },
      keys: [SAVED_KEY, { provider: 'google', last4: 'abcd', savedAt: '2026-11-27T12:00:00.000Z' }],
    });
    const ia = await aiSection();
    fireEvent.click(ia.getByRole('radio', { name: /Gemini/ }));
    expect(await ia.findByText('abcd')).toBeDefined();
    const select = await ia.findByLabelText<HTMLSelectElement>('Modelo');
    // Sem sugestão para o Gemini, vem o primeiro da lista da conta.
    await waitFor(() => expect(select.value).toBe('gemini-3-pro'));
    await waitFor(() =>
      expect(ai.state.saved).toEqual([
        { provider: 'google', model: 'gemini-3-pro', effort: 'fast' },
      ]),
    );

    // Voltar ao Claude traz o modelo que estava salvo para ele? Não: o salvo agora é o do Gemini.
    fireEvent.click(ia.getByRole('radio', { name: /OpenAI/ }));
    expect(await ia.findByLabelText('Chave da API')).toBeDefined();
    expect(ia.getByLabelText('Modelo')).toHaveProperty('disabled', true);
  });

  it('se a lista de modelos falha, deixa tentar de novo', async () => {
    const ai = renderAi({
      settings: { provider: 'anthropic', model: 'claude-haiku-5-5', effort: 'balanced' },
      keys: [SAVED_KEY],
    });
    const ia = await aiSection();
    // A primeira lista (já em andamento) pode ter chegado; o erro vale para a próxima chamada.
    await ia.findByLabelText('Modelo');
    ai.state.failNext = { message: 'O Claude pediu para esperar um pouco.' };
    fireEvent.click(ia.getByRole('radio', { name: /Gemini/ }));
    fireEvent.click(ia.getByRole('radio', { name: /Claude/ }));
    expect(await ia.findByText(/pediu para esperar/)).toBeDefined();
    fireEvent.click(ia.getByRole('button', { name: 'Tentar de novo' }));
    expect(await ia.findByLabelText('Modelo')).toBeDefined();
  });

  it('chave já recusada pelo provedor na lista de modelos pede para trocar a chave', async () => {
    const ai = renderAi({ keys: [SAVED_KEY] });
    ai.state.failModels = { message: 'O Claude recusou a chave.', code: 'key_rejected' };
    const ia = await aiSection();
    expect(await ia.findByText('Chave recusada pelo provedor')).toBeDefined();
    expect(ia.getByText(/Troque a chave acima/)).toBeDefined();
  });

  it('se salvar a escolha falha, mostra o erro', async () => {
    const ai = renderAi({
      settings: { provider: 'anthropic', model: 'claude-haiku-5-5', effort: 'balanced' },
      keys: [SAVED_KEY],
    });
    const ia = await aiSection();
    await ia.findByLabelText('Modelo');
    ai.state.failNext = { message: 'Sem conexão com o Trama. Confira a internet.' };
    fireEvent.click(ia.getByRole('radio', { name: 'Caprichado' }));
    expect(await ia.findByText(/Sem conexão com o Trama/)).toBeDefined();
    expect(ia.queryByText('Salvo')).toBeNull();
  });
});

describe('Configurações: IA, carregamento', () => {
  it('mostra "Carregando…" e, se falhar, o erro com "Tentar de novo"', async () => {
    const auth = createFakeAuth();
    auth.addAccount('Ana Souza', 'ana@exemplo.com', 'senha-segura-1');
    auth.signInAs('ana@exemplo.com');
    const ai = createFakeAi();
    ai.state.failNext = { message: 'Sem conexão com o Trama. Confira a internet.' };
    render(
      <App
        client={auth.client}
        history={createMemoryHistory({ initialEntries: ['/configuracoes'] })}
        services={{
          ...defaultServices,
          projects: createFakeProjects([]).api,
          account: createFakeAccount().api,
          ai: ai.api,
        }}
      />,
    );
    const region = await screen.findByRole('region', { name: 'IA' });
    const ia = within(region);
    expect(await ia.findByText(/Sem conexão com o Trama/)).toBeDefined();
    fireEvent.click(ia.getByRole('button', { name: 'Tentar de novo' }));
    expect(await ia.findByRole('radio', { name: /Claude/ })).toBeDefined();
  });
});

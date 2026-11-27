import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { createFakeAuth } from '../test/fake-auth';

afterEach(cleanup);

function renderAt(path: string, auth = createFakeAuth()) {
  const history = createMemoryHistory({ initialEntries: [path] });
  render(<App client={auth.client} history={history} />);
  return { auth, history };
}

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function submit(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
}

describe('rotas protegidas', () => {
  it('quem não entrou vai do início para a tela de entrar', async () => {
    const { history } = renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Entrar no Trama' })).toBeDefined();
    expect(history.location.pathname).toBe('/entrar');
  });

  it('quem já entrou não vê a tela de entrar', async () => {
    const auth = createFakeAuth();
    auth.addAccount('Ana Souza', 'ana@exemplo.com', 'senha-boa-1');
    auth.signInAs('ana@exemplo.com');
    renderAt('/entrar', auth);
    expect(await screen.findByRole('heading', { name: /, Ana$/ })).toBeDefined();
  });

  it('mostra a página de não encontrado', async () => {
    renderAt('/nao-existe');
    expect(await screen.findByRole('heading', { name: 'Página não encontrada' })).toBeDefined();
  });
});

describe('entrar', () => {
  it('avisa e-mail ou senha errados e entra com os certos', async () => {
    const auth = createFakeAuth();
    auth.addAccount('Ana Souza', 'ana@exemplo.com', 'senha-boa-1');
    renderAt('/entrar', auth);
    await screen.findByRole('heading', { name: 'Entrar no Trama' });

    type('E-mail', 'ana@exemplo.com');
    type('Senha', 'errada-123');
    submit('Entrar');
    expect((await screen.findByRole('alert')).textContent).toBe('E-mail ou senha incorretos.');

    type('Senha', 'senha-boa-1');
    submit('Entrar');
    expect(await screen.findByRole('heading', { name: /, Ana$/ })).toBeDefined();
    expect(screen.getByText('ana@exemplo.com')).toBeDefined();
  });

  it('valida os campos antes de enviar', async () => {
    renderAt('/entrar');
    await screen.findByRole('heading', { name: 'Entrar no Trama' });
    type('E-mail', 'ana@');
    submit('Entrar');
    expect(
      await screen.findByText('Digite um e-mail válido, como nome@exemplo.com.'),
    ).toBeDefined();
    expect(screen.getByText('Digite a sua senha.')).toBeDefined();
  });

  it('volta para a página pedida, mas nunca para outro site', async () => {
    const auth = createFakeAuth();
    auth.addAccount('Ana', 'ana@exemplo.com', 'senha-boa-1');
    const { history } = renderAt('/entrar?volta=%2F%2Fgolpe.example', auth);
    await screen.findByRole('heading', { name: 'Entrar no Trama' });
    type('E-mail', 'ana@exemplo.com');
    type('Senha', 'senha-boa-1');
    submit('Entrar');
    await screen.findByRole('heading', { name: /, Ana$/ });
    expect(history.location.pathname).toBe('/');
  });
});

describe('criar conta', () => {
  it('pede nome, e-mail e senha de 8 caracteres', async () => {
    renderAt('/criar-conta');
    await screen.findByRole('heading', { name: 'Criar conta' });
    type('Senha', 'curta');
    submit('Criar conta');
    expect(await screen.findByText('Digite o seu nome.')).toBeDefined();
    expect(screen.getByText('Digite o seu e-mail.')).toBeDefined();
    expect(screen.getByText('Use pelo menos 8 caracteres.')).toBeDefined();
  });

  it('cria a conta e já entra', async () => {
    renderAt('/criar-conta');
    await screen.findByRole('heading', { name: 'Criar conta' });
    type('Nome', '  Bruno Lima ');
    type('E-mail', 'bruno@exemplo.com');
    type('Senha', 'senha-boa-1');
    submit('Criar conta');
    expect(await screen.findByRole('heading', { name: /, Bruno$/ })).toBeDefined();
  });

  it('avisa quando o e-mail precisa ser confirmado antes', async () => {
    renderAt('/criar-conta', createFakeAuth({ requireConfirmation: true }));
    await screen.findByRole('heading', { name: 'Criar conta' });
    type('Nome', 'Bruno');
    type('E-mail', 'bruno@exemplo.com');
    type('Senha', 'senha-boa-1');
    submit('Criar conta');
    expect(await screen.findByRole('heading', { name: 'Confira o seu e-mail' })).toBeDefined();
    expect(screen.getByRole('status').textContent).toContain('bruno@exemplo.com');
  });

  it('avisa quando o e-mail já tem conta', async () => {
    const auth = createFakeAuth();
    auth.addAccount('Ana', 'ana@exemplo.com', 'senha-boa-1');
    renderAt('/criar-conta', auth);
    await screen.findByRole('heading', { name: 'Criar conta' });
    type('Nome', 'Outra Ana');
    type('E-mail', 'ana@exemplo.com');
    type('Senha', 'senha-boa-2');
    submit('Criar conta');
    expect((await screen.findByRole('alert')).textContent).toContain('Já existe uma conta');
  });
});

describe('esqueci a senha', () => {
  it('pede o link e não revela se o e-mail tem conta', async () => {
    const { auth } = renderAt('/esqueci-a-senha');
    await screen.findByRole('heading', { name: 'Esqueci a senha' });
    type('E-mail', 'quem@exemplo.com');
    submit('Enviar link');
    expect(await screen.findByRole('heading', { name: 'Confira o seu e-mail' })).toBeDefined();
    expect(screen.getByRole('status').textContent).toContain('Se existir uma conta com');
    expect(auth.calls.requestPasswordReset).toEqual(['quem@exemplo.com']);
  });
});

describe('senha nova', () => {
  it('confere o link uma vez só, troca a senha e limpa o endereço', async () => {
    const auth = createFakeAuth();
    auth.addAccount('Ana', 'ana@exemplo.com', 'senha-velha-1');
    auth.issueRecoveryToken('ana@exemplo.com', 'tok123');
    const { history } = renderAt('/nova-senha?token_hash=tok123&type=recovery', auth);

    await screen.findByRole('heading', { name: 'Criar senha nova' });
    await screen.findByLabelText('Senha nova');
    expect(auth.calls.verifyRecovery).toEqual(['tok123']);
    await waitFor(() => expect(history.location.search).toBe(''));

    type('Senha nova', 'senha-nova-1');
    type('Repita a senha nova', 'senha-nova-2');
    submit('Salvar senha nova');
    expect(await screen.findByText('As senhas não são iguais.')).toBeDefined();

    type('Repita a senha nova', 'senha-nova-1');
    submit('Salvar senha nova');
    expect(await screen.findByRole('heading', { name: 'Senha alterada' })).toBeDefined();
    expect(auth.passwordOf('ana@exemplo.com')).toBe('senha-nova-1');
  });

  it('mostra o que fazer quando o link expirou', async () => {
    renderAt('/nova-senha?token_hash=usado&type=recovery');
    expect(await screen.findByRole('heading', { name: 'Link inválido' })).toBeDefined();
    expect(screen.getByRole('alert').textContent).toContain('expirou ou já foi usado');
    expect(screen.getByRole('link', { name: 'Pedir um link novo' })).toBeDefined();
  });

  it('sem link e sem sessão, explica que o link vem por e-mail', async () => {
    renderAt('/nova-senha');
    expect(await screen.findByRole('heading', { name: 'Link inválido' })).toBeDefined();
  });
});

describe('sair', () => {
  it('volta para a tela de entrar', async () => {
    const auth = createFakeAuth();
    auth.addAccount('Ana', 'ana@exemplo.com', 'senha-boa-1');
    auth.signInAs('ana@exemplo.com');
    renderAt('/', auth);
    await screen.findByRole('heading', { name: /, Ana$/ });
    submit('Sair');
    expect(await screen.findByRole('heading', { name: 'Entrar no Trama' })).toBeDefined();
  });
});

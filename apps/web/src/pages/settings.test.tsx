import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { defaultServices, type Services } from '../services';
import { createFakeAccount } from '../test/fake-account';
import { createFakeAuth } from '../test/fake-auth';
import { createFakeProjects } from '../test/fake-projects';
import { browserTimeZones, groupTimeZones } from './settings/time-zones';

afterEach(cleanup);

function renderSettings(
  options: { path?: string; signedIn?: boolean; services?: Partial<Services> } = {},
) {
  const { path = '/configuracoes', signedIn = true, services } = options;
  const auth = createFakeAuth();
  auth.addAccount('Ana Souza', 'ana@exemplo.com', 'senha-segura-1');
  auth.addAccount('Bia Lima', 'bia@exemplo.com', 'outra-senha-1');
  if (signedIn) auth.signInAs('ana@exemplo.com');
  const account = createFakeAccount();
  const history = createMemoryHistory({ initialEntries: [path] });
  render(
    <App
      client={auth.client}
      history={history}
      services={{
        ...defaultServices,
        projects: createFakeProjects([]).api,
        account: account.api,
        ...services,
      }}
    />,
  );
  return { auth, account, history };
}

const section = (name: string) => within(screen.getByRole('region', { name }));
const type = (label: string, value: string, scope: Pick<typeof screen, 'getByLabelText'>) =>
  fireEvent.change(scope.getByLabelText(label), { target: { value } });

describe('Configurações: a tela', () => {
  it('mostra as seções, com a IA desligada no lugar dela', async () => {
    renderSettings();
    expect(await screen.findByRole('heading', { level: 1, name: 'Configurações' })).toBeDefined();
    for (const name of ['Conta', 'E-mail', 'Senha', 'Fuso horário', 'E-mails do Trama', 'IA']) {
      expect(await screen.findByRole('region', { name })).toBeDefined();
    }
    expect(section('Conta').getByLabelText('Nome')).toHaveProperty('value', 'Ana Souza');
    expect(section('Conta').getByText('ana@exemplo.com')).toBeDefined();
    expect(section('IA').getByRole('button', { name: 'Em breve' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('o item da barra lateral leva do Início às Configurações', async () => {
    const { history } = renderSettings({ path: '/' });
    fireEvent.click((await screen.findAllByRole('link', { name: 'Configurações' }))[0]!);
    await waitFor(() => expect(history.location.pathname).toBe('/configuracoes'));
    expect(await screen.findByRole('region', { name: 'Conta' })).toBeDefined();
    expect(
      screen.getAllByRole('link', { name: 'Configurações' }).some((link) => {
        return link.getAttribute('aria-current') === 'page';
      }),
    ).toBe(true);
  });

  it('quem não entrou vai para o login e volta depois', async () => {
    const { history } = renderSettings({ signedIn: false });
    await waitFor(() => expect(history.location.pathname).toBe('/entrar'));
    expect(history.location.search).toContain('configuracoes');
  });

  it('sem a API configurada, explica o que falta', async () => {
    renderSettings({ services: { account: null } });
    expect(await screen.findByText(/VITE_API_URL/)).toBeDefined();
    expect(screen.queryByRole('region', { name: 'Conta' })).toBeNull();
  });

  it('se o perfil não carrega, mostra o erro e deixa tentar de novo', async () => {
    const { account } = renderSettings({ path: '/' });
    account.state.failNext = 'Sem conexão com o Trama. Confira a internet e tente de novo.';
    fireEvent.click((await screen.findAllByRole('link', { name: 'Configurações' }))[0]!);
    expect(await screen.findByText(/Sem conexão com o Trama/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('region', { name: 'Conta' })).toBeDefined();
  });
});

describe('Configurações: nome', () => {
  it('salva o nome no perfil e na conta, e avisa "Salvo"', async () => {
    const { account, auth } = renderSettings();
    await screen.findByRole('region', { name: 'Conta' });
    const conta = section('Conta');
    type('Nome', '  Ana Maria  ', conta);
    fireEvent.click(conta.getByRole('button', { name: 'Salvar nome' }));
    expect(await conta.findByText('Salvo')).toBeDefined();
    expect(account.state.patches).toEqual([{ name: 'Ana Maria' }]);
    expect(auth.calls.updateName).toEqual(['Ana Maria']);
  });

  it('recusa nome vazio ou com mais de 80 letras, sem chamar a API', async () => {
    const { account } = renderSettings();
    await screen.findByRole('region', { name: 'Conta' });
    const conta = section('Conta');
    type('Nome', '   ', conta);
    fireEvent.click(conta.getByRole('button', { name: 'Salvar nome' }));
    expect(await conta.findByText('Digite o seu nome.')).toBeDefined();
    type('Nome', 'a'.repeat(81), conta);
    fireEvent.click(conta.getByRole('button', { name: 'Salvar nome' }));
    expect(await conta.findByText('Use no máximo 80 caracteres.')).toBeDefined();
    expect(account.state.patches).toEqual([]);
  });

  it('mostra o erro da API em português', async () => {
    const { account } = renderSettings();
    await screen.findByRole('region', { name: 'Conta' });
    const conta = section('Conta');
    account.state.failNext = 'Sem conexão com o Trama. Confira a internet e tente de novo.';
    fireEvent.click(conta.getByRole('button', { name: 'Salvar nome' }));
    expect(await conta.findByText(/Sem conexão com o Trama/)).toBeDefined();
    expect(conta.queryByText('Salvo')).toBeNull();
  });
});

describe('Configurações: e-mail', () => {
  it('pede o link de confirmação e explica que a troca só vale depois dele', async () => {
    const { auth } = renderSettings();
    await screen.findByRole('region', { name: 'E-mail' });
    const email = section('E-mail');
    type('Novo e-mail', 'ana.nova@exemplo.com', email);
    fireEvent.click(email.getByRole('button', { name: 'Trocar e-mail' }));
    const aviso = await email.findByRole('status');
    expect(aviso.textContent).toContain('ana.nova@exemplo.com');
    expect(aviso.textContent).toContain('ana@exemplo.com');
    expect(aviso.textContent).toContain('depois que você abrir os dois links');
    expect(auth.calls.updateEmail).toEqual(['ana.nova@exemplo.com']);
    expect(email.getByLabelText('Novo e-mail')).toHaveProperty('value', '');
  });

  it('recusa e-mail inválido e o mesmo e-mail de agora', async () => {
    const { auth } = renderSettings();
    await screen.findByRole('region', { name: 'E-mail' });
    const email = section('E-mail');
    type('Novo e-mail', 'sem-arroba', email);
    fireEvent.click(email.getByRole('button', { name: 'Trocar e-mail' }));
    expect(await email.findByText(/Digite um e-mail válido/)).toBeDefined();
    type('Novo e-mail', 'ANA@exemplo.com', email);
    fireEvent.click(email.getByRole('button', { name: 'Trocar e-mail' }));
    expect(await email.findByText('Este já é o seu e-mail de entrada.')).toBeDefined();
    expect(auth.calls.updateEmail).toEqual([]);
  });

  it('mostra o erro quando o e-mail já tem conta', async () => {
    renderSettings();
    await screen.findByRole('region', { name: 'E-mail' });
    const email = section('E-mail');
    type('Novo e-mail', 'bia@exemplo.com', email);
    fireEvent.click(email.getByRole('button', { name: 'Trocar e-mail' }));
    expect(await email.findByText(/Já existe uma conta com este e-mail/)).toBeDefined();
  });
});

describe('Configurações: senha', () => {
  const fill = (current: string, password: string, confirm: string) => {
    const senha = section('Senha');
    type('Senha atual', current, senha);
    type('Senha nova', password, senha);
    type('Repita a senha nova', confirm, senha);
    fireEvent.click(senha.getByRole('button', { name: 'Trocar senha' }));
    return senha;
  };

  it('confere a senha atual e grava a nova', async () => {
    const { auth } = renderSettings();
    await screen.findByRole('region', { name: 'Senha' });
    const senha = fill('senha-segura-1', 'senha-nova-123', 'senha-nova-123');
    expect(await senha.findByText(/Senha alterada/)).toBeDefined();
    expect(auth.passwordOf('ana@exemplo.com')).toBe('senha-nova-123');
    expect(senha.getByLabelText('Senha atual')).toHaveProperty('value', '');
  });

  it('com a senha atual errada, não troca nada', async () => {
    const { auth } = renderSettings();
    await screen.findByRole('region', { name: 'Senha' });
    const senha = fill('errada-errada', 'senha-nova-123', 'senha-nova-123');
    expect(await senha.findByText('A senha atual não confere.')).toBeDefined();
    expect(auth.passwordOf('ana@exemplo.com')).toBe('senha-segura-1');
  });

  it('aplica as regras do cadastro: 8 a 72 caracteres e as duas iguais', async () => {
    const { auth } = renderSettings();
    await screen.findByRole('region', { name: 'Senha' });
    let senha = fill('senha-segura-1', 'curta', 'curta');
    expect(await senha.findByText('Use pelo menos 8 caracteres.')).toBeDefined();
    senha = fill('senha-segura-1', 'a'.repeat(73), 'a'.repeat(73));
    expect(await senha.findByText('Use no máximo 72 caracteres.')).toBeDefined();
    senha = fill('senha-segura-1', 'senha-nova-123', 'senha-nova-124');
    expect(await senha.findByText('As senhas não são iguais.')).toBeDefined();
    senha = fill('', 'senha-nova-123', 'senha-nova-123');
    expect(await senha.findByText('Digite a sua senha atual.')).toBeDefined();
    expect(auth.passwordOf('ana@exemplo.com')).toBe('senha-segura-1');
  });
});

describe('Configurações: fuso horário', () => {
  it('lista os fusos do Brasil primeiro e salva ao escolher', async () => {
    const { account } = renderSettings();
    await screen.findByRole('region', { name: 'Fuso horário' });
    const fuso = section('Fuso horário');
    const select = fuso.getByLabelText<HTMLSelectElement>('Seu fuso');
    expect(select.value).toBe('America/Sao_Paulo');
    const groups = [...select.querySelectorAll('optgroup')];
    expect(groups.map((group) => group.label)).toEqual(['Brasil', 'Outros fusos']);
    expect(groups[0]?.querySelector('option')?.value).toBe('America/Sao_Paulo');
    fireEvent.change(select, { target: { value: 'America/Manaus' } });
    expect(await fuso.findByText('Salvo')).toBeDefined();
    expect(account.state.patches).toEqual([{ timezone: 'America/Manaus' }]);
    expect(select.value).toBe('America/Manaus');
  });

  it('agrupa: Brasil em cima, o resto em ordem, e mantém o fuso atual mesmo fora da lista', () => {
    const { brazil, others } = groupTimeZones(
      ['Europe/Lisbon', 'America/Manaus', 'Asia/Tokyo', 'America/Sao_Paulo'],
      'UTC',
    );
    expect(brazil.map((zone) => zone.id)).toEqual(['America/Sao_Paulo', 'America/Manaus']);
    expect(others.map((zone) => zone.id)).toEqual(['Asia/Tokyo', 'Europe/Lisbon', 'UTC']);
    expect(brazil[0]?.label).toBe('Brasília (São Paulo)');
    expect(browserTimeZones()).toContain('America/Sao_Paulo');
  });
});

describe('Configurações: e-mails do Trama', () => {
  it('liga e desliga um por vez, sem mexer no outro', async () => {
    const { account } = renderSettings();
    await screen.findByRole('region', { name: 'E-mails do Trama' });
    const emails = section('E-mails do Trama');
    const resumo = emails.getByRole('switch', { name: 'Resumo semanal' });
    const lembrete = emails.getByRole('switch', { name: 'Lembrete de revisão' });
    expect(resumo.getAttribute('aria-checked')).toBe('true');
    expect(lembrete.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(lembrete);
    await waitFor(() => expect(lembrete.getAttribute('aria-checked')).toBe('true'));
    fireEvent.click(resumo);
    await waitFor(() => expect(resumo.getAttribute('aria-checked')).toBe('false'));
    expect(lembrete.getAttribute('aria-checked')).toBe('true');
    expect(account.state.patches).toEqual([
      { emailPreferences: { reviewReminders: true } },
      { emailPreferences: { weeklySummary: false } },
    ]);
    expect(await emails.findByText('Salvo')).toBeDefined();
  });

  it('diz que os e-mails da conta sempre saem', async () => {
    renderSettings();
    expect(await screen.findByText(/recuperação de senha.*sempre saem/)).toBeDefined();
  });

  it('se salvar falha, mostra o erro e a chave fica como estava', async () => {
    const { account } = renderSettings();
    await screen.findByRole('region', { name: 'E-mails do Trama' });
    const emails = section('E-mails do Trama');
    account.state.failNext = 'Sem conexão com o Trama. Confira a internet e tente de novo.';
    const resumo = emails.getByRole('switch', { name: 'Resumo semanal' });
    fireEvent.click(resumo);
    expect(await emails.findByText(/Sem conexão com o Trama/)).toBeDefined();
    expect(resumo.getAttribute('aria-checked')).toBe('true');
  });
});

describe('Confirmar a troca de e-mail', () => {
  it('confere o link do e-mail e explica o que falta', async () => {
    const { auth } = renderSettings({ path: '/confirmar-email?token_hash=bom', signedIn: false });
    expect(await screen.findByRole('heading', { name: 'Link confirmado' })).toBeDefined();
    expect(screen.getByText(/a troca só vale depois dos dois/)).toBeDefined();
    expect(auth.calls.verifyEmailChange).toEqual(['bom']);
  });

  it('link vencido mostra o erro', async () => {
    renderSettings({ path: '/confirmar-email?token_hash=velho', signedIn: false });
    expect(await screen.findByRole('heading', { name: 'Link inválido' })).toBeDefined();
    expect(screen.getByText(/expirou ou já foi usado/)).toBeDefined();
  });

  it('sem o código no endereço, pede para abrir o link do e-mail', async () => {
    const { auth } = renderSettings({ path: '/confirmar-email', signedIn: false });
    expect(await screen.findByText(/abra o link que enviamos/)).toBeDefined();
    expect(auth.calls.verifyEmailChange).toEqual([]);
  });
});

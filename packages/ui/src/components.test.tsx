import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Alert, Button, Logo, LogoMark, PasswordField, TextField } from './index';

afterEach(cleanup);

describe('Button', () => {
  it('é um botão de verdade e não envia formulário por padrão', () => {
    render(<Button>Entrar</Button>);
    expect(screen.getByRole('button', { name: 'Entrar' }).getAttribute('type')).toBe('button');
  });

  it('carregando, bloqueia novos cliques', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Entrar
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Entrar' });
    expect(button).toHaveProperty('disabled', true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('TextField', () => {
  it('liga o rótulo ao campo', () => {
    render(<TextField label="E-mail" type="email" />);
    expect(screen.getByLabelText('E-mail').getAttribute('type')).toBe('email');
  });

  it('com erro, marca o campo e o liga à mensagem', () => {
    render(
      <TextField label="E-mail" error="Digite um e-mail válido." hint="Usamos só para entrar." />,
    );
    const input = screen.getByLabelText('E-mail');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const described = (input.getAttribute('aria-describedby') ?? '').split(' ');
    const texts = described.map((id) => document.getElementById(id)?.textContent);
    expect(texts).toEqual(['Digite um e-mail válido.', 'Usamos só para entrar.']);
  });
});

describe('PasswordField', () => {
  it('mostra e oculta a senha', () => {
    render(<PasswordField label="Senha" />);
    const input = screen.getByLabelText('Senha');
    expect(input.getAttribute('type')).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(input.getAttribute('type')).toBe('text');
    expect(screen.getByRole('button', { name: 'Ocultar senha' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });
});

describe('Alert', () => {
  it('anuncia erros e avisa sucessos sem interromper', () => {
    render(
      <>
        <Alert tone="error">Senha incorreta.</Alert>
        <Alert tone="success">Senha alterada.</Alert>
      </>,
    );
    expect(screen.getByRole('alert').textContent).toBe('Senha incorreta.');
    expect(screen.getByRole('status').textContent).toBe('Senha alterada.');
  });
});

describe('Logo', () => {
  it('é decorativo sem título e nomeado com título', () => {
    const { container } = render(<LogoMark />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    cleanup();
    render(<LogoMark title="Trama" />);
    expect(screen.getByRole('img', { name: 'Trama' })).toBeDefined();
  });

  it('mostra o nome ao lado do símbolo', () => {
    render(<Logo />);
    expect(screen.getByText('Trama')).toBeDefined();
  });
});

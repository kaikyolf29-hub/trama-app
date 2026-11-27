import { Link } from '@tanstack/react-router';
import { Alert, Button, TextField } from '@trama/ui';
import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/context';
import { forgotPasswordSchema, validate } from '../auth/validation';
import { AuthLayout } from './AuthLayout';
import { textLinkClass } from './styles';

export function ForgotPasswordPage() {
  const { client } = useAuth();
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validate(
      forgotPasswordSchema,
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    setFormError(null);
    if (!result.ok) {
      setError(result.errors.email);
      return;
    }
    setError(undefined);
    setLoading(true);
    const response = await client.requestPasswordReset(result.data.email);
    setLoading(false);
    if (!response.ok) {
      setFormError(response.error);
      return;
    }
    setSentTo(result.data.email);
  }

  const back = (
    <Link to="/entrar" className={textLinkClass}>
      Voltar para entrar
    </Link>
  );

  if (sentTo) {
    return (
      <AuthLayout title="Confira o seu e-mail" footer={back}>
        <div className="flex flex-col gap-4">
          {/* Não dizemos se o e-mail tem conta: isso protege quem usa o Trama. */}
          <Alert tone="success">
            Se existir uma conta com <strong className="font-semibold">{sentTo}</strong>, você vai
            receber um link para criar uma senha nova.
          </Alert>
          <p className="text-[13px] text-text-muted">
            O link vale por 1 hora. Não chegou? Confira a pasta de spam ou peça de novo.
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Esqueci a senha"
      subtitle="Digite o e-mail da sua conta. Enviamos um link para você criar uma senha nova."
      footer={back}
    >
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
        {formError && <Alert tone="error">{formError}</Alert>}
        <TextField
          label="E-mail"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoFocus
          error={error}
        />
        <Button type="submit" size="lg" block loading={loading} className="mt-2">
          Enviar link
        </Button>
      </form>
    </AuthLayout>
  );
}

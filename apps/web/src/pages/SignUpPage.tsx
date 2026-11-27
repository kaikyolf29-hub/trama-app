import { Link, useNavigate } from '@tanstack/react-router';
import { Alert, Button, PasswordField, TextField } from '@trama/ui';
import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/context';
import { signUpSchema, validate, type FieldErrors } from '../auth/validation';
import { AuthLayout } from './AuthLayout';
import { textLinkClass } from './styles';

type Fields = { name: string; email: string; password: string };

export function SignUpPage() {
  const { client } = useAuth();
  const navigate = useNavigate();
  const [errors, setErrors] = useState<FieldErrors<Fields>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validate(signUpSchema, Object.fromEntries(new FormData(event.currentTarget)));
    setFormError(null);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setLoading(true);
    const response = await client.signUp(result.data);
    setLoading(false);
    if (!response.ok) {
      setFormError(response.error);
      return;
    }
    if (response.value.needsConfirmation) {
      setConfirmEmail(result.data.email);
      return;
    }
    await navigate({ to: '/' });
  }

  if (confirmEmail) {
    return (
      <AuthLayout title="Confira o seu e-mail">
        <div className="flex flex-col gap-4">
          <Alert tone="info">
            Enviamos um link para <strong className="font-semibold">{confirmEmail}</strong>. Abra o
            link para ativar a conta e entrar.
          </Alert>
          <p className="text-[13px] text-text-muted">
            Não chegou em alguns minutos? Confira a pasta de spam.
          </p>
          <Link to="/entrar" className={`self-start text-[13px] ${textLinkClass}`}>
            Voltar para entrar
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Criar conta"
      subtitle="Em segundos você está no quadro."
      footer={
        <>
          Já tem conta?{' '}
          <Link to="/entrar" className={textLinkClass}>
            Entrar
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
        {formError && <Alert tone="error">{formError}</Alert>}
        <TextField
          label="Nome"
          name="name"
          autoComplete="name"
          placeholder="Como você quer ser chamado"
          autoFocus
          error={errors.name}
        />
        <TextField
          label="E-mail"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          error={errors.email}
        />
        <PasswordField
          label="Senha"
          name="password"
          autoComplete="new-password"
          hint="Pelo menos 8 caracteres."
          error={errors.password}
        />
        <Button type="submit" size="lg" block loading={loading} className="mt-2">
          Criar conta
        </Button>
      </form>
    </AuthLayout>
  );
}

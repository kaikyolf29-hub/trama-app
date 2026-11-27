import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { Alert, Button, PasswordField, TextField } from '@trama/ui';
import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/context';
import { safeReturnPath } from '../auth/return-path';
import { signInSchema, validate, type FieldErrors } from '../auth/validation';
import { AuthLayout } from './AuthLayout';
import { textLinkClass } from './styles';

const route = getRouteApi('/entrar');

export function SignInPage() {
  const { client } = useAuth();
  const navigate = useNavigate();
  const { volta } = route.useSearch();
  const [errors, setErrors] = useState<FieldErrors<{ email: string; password: string }>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validate(signInSchema, Object.fromEntries(new FormData(event.currentTarget)));
    setFormError(null);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setLoading(true);
    const response = await client.signIn(result.data);
    setLoading(false);
    if (!response.ok) {
      setFormError(response.error);
      return;
    }
    await navigate({ to: safeReturnPath(volta) ?? '/' });
  }

  return (
    <AuthLayout
      title="Entrar no Trama"
      subtitle="Seus fluxos, aulas e roteiros estão esperando."
      footer={
        <>
          Não tem conta?{' '}
          <Link to="/criar-conta" className={textLinkClass}>
            Criar conta
          </Link>
        </>
      }
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
          error={errors.email}
        />
        <PasswordField
          label="Senha"
          name="password"
          autoComplete="current-password"
          error={errors.password}
          labelAction={
            <Link to="/esqueci-a-senha" className={`text-xs ${textLinkClass}`}>
              Esqueci a senha
            </Link>
          }
        />
        <Button type="submit" size="lg" block loading={loading} className="mt-2">
          Entrar
        </Button>
      </form>
    </AuthLayout>
  );
}

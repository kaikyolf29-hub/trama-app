import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { Alert, Button, PasswordField, Spinner } from '@trama/ui';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/context';
import { newPasswordSchema, validate, type FieldErrors } from '../auth/validation';
import { AuthLayout } from './AuthLayout';
import { textLinkClass } from './styles';

const route = getRouteApi('/nova-senha');

type Stage =
  { kind: 'checking' } | { kind: 'invalid'; reason: string } | { kind: 'ready' } | { kind: 'done' };

const NO_LINK =
  'Para criar uma senha nova, abra o link que enviamos para o seu e-mail. Ele vale por 1 hora.';

export function NewPasswordPage() {
  const { client, status } = useAuth();
  const navigate = useNavigate();
  const { token_hash: tokenHash } = route.useSearch();
  // Resultado da conferência do link do e-mail (só existe quando a página abriu com um).
  const [linkStage, setLinkStage] = useState<Stage | null>(tokenHash ? { kind: 'checking' } : null);
  const [done, setDone] = useState(false);
  const verified = useRef<string | null>(null);

  useEffect(() => {
    // O link só pode ser usado uma vez: confere uma vez só, mesmo no StrictMode.
    if (!tokenHash || verified.current === tokenHash) return;
    verified.current = tokenHash;
    void client.verifyRecovery(tokenHash).then((response) => {
      if (!response.ok) {
        setLinkStage({ kind: 'invalid', reason: response.error });
        return;
      }
      setLinkStage({ kind: 'ready' });
      // Tira o código do endereço: recarregar a página não deve gastar o link de novo.
      void navigate({ to: '/nova-senha', search: {}, replace: true });
    });
  }, [tokenHash, client, navigate]);

  // Sem link: quem já entrou pode trocar a senha; quem não entrou precisa do e-mail.
  const stage: Stage = done
    ? { kind: 'done' }
    : (linkStage ??
      (status === 'loading'
        ? { kind: 'checking' }
        : status === 'signedIn'
          ? { kind: 'ready' }
          : { kind: 'invalid', reason: NO_LINK }));

  if (stage.kind === 'checking') {
    return (
      <AuthLayout title="Criar senha nova">
        <p role="status" className="flex items-center gap-2.5 text-text-muted">
          <Spinner /> Conferindo o link…
        </p>
      </AuthLayout>
    );
  }

  if (stage.kind === 'invalid') {
    return (
      <AuthLayout
        title="Link inválido"
        footer={
          <Link to="/entrar" className={textLinkClass}>
            Voltar para entrar
          </Link>
        }
      >
        <div className="flex flex-col gap-4">
          <Alert tone="error">{stage.reason}</Alert>
          <Link to="/esqueci-a-senha" className={`self-start text-[13px] ${textLinkClass}`}>
            Pedir um link novo
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (stage.kind === 'done') {
    return (
      <AuthLayout title="Senha alterada">
        <div className="flex flex-col gap-4">
          <Alert tone="success">Pronto. Da próxima vez, entre com a senha nova.</Alert>
          <Button size="lg" block onClick={() => void navigate({ to: '/' })}>
            Ir para o Trama
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return <NewPasswordForm onDone={() => setDone(true)} />;
}

function NewPasswordForm({ onDone }: { onDone: () => void }) {
  const { client } = useAuth();
  const [errors, setErrors] = useState<FieldErrors<{ password: string; confirm: string }>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validate(
      newPasswordSchema,
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    setFormError(null);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setLoading(true);
    const response = await client.updatePassword(result.data.password);
    setLoading(false);
    if (!response.ok) {
      setFormError(response.error);
      return;
    }
    onDone();
  }

  return (
    <AuthLayout title="Criar senha nova" subtitle="Escolha a senha que você vai usar para entrar.">
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
        {formError && <Alert tone="error">{formError}</Alert>}
        <PasswordField
          label="Senha nova"
          name="password"
          autoComplete="new-password"
          hint="Pelo menos 8 caracteres."
          autoFocus
          error={errors.password}
        />
        <PasswordField
          label="Repita a senha nova"
          name="confirm"
          autoComplete="new-password"
          error={errors.confirm}
        />
        <Button type="submit" size="lg" block loading={loading} className="mt-2">
          Salvar senha nova
        </Button>
      </form>
    </AuthLayout>
  );
}

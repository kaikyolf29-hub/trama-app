import {
  profileNameSchema,
  timeZoneSchema,
  type EmailPreferences,
  type Profile,
  type UpdateProfileRequest,
} from '@trama/core';
import { Alert, Button, PasswordField, TextField } from '@trama/ui';
import { useId, useMemo, useState, type FormEvent } from 'react';
import type { AccountApi } from '../../api/account-api';
import { useAuth } from '../../auth/context';
import { GENERIC_ERROR, INVALID_CREDENTIALS } from '../../auth/errors';
import {
  changeEmailSchema,
  changePasswordSchema,
  validate,
  type FieldErrors,
} from '../../auth/validation';
import { SavedNote, Section } from './Section';
import { Switch } from './Switch';
import { browserTimeZones, groupTimeZones } from './time-zones';

interface ProfileSectionProps {
  profile: Profile;
  api: AccountApi;
  onProfile: (profile: Profile) => void;
}

/** Mensagem de qualquer erro vindo da API (a da API já é em português). */
function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : GENERIC_ERROR;
}

/** Conta: o nome (do perfil) e o e-mail de entrada (só leitura; a troca é a seção seguinte). */
export function AccountSection({ profile, api, onProfile }: ProfileSectionProps) {
  const { user, client } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    const parsed = profileNameSchema.safeParse(new FormData(event.currentTarget).get('name'));
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Digite o seu nome.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      onProfile(await api.updateProfile({ name: parsed.data }));
      // A saudação e a barra lateral leem o nome da conta; se falhar, o perfil já está salvo.
      await client.updateName(parsed.data);
      setSaved(true);
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Section title="Conta" description="Como o Trama chama você.">
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
        <TextField
          label="Nome"
          name="name"
          autoComplete="name"
          defaultValue={profile.name || user?.name || ''}
          error={error}
          onChange={() => setSaved(false)}
        />
        <div>
          <p className="text-[13px] font-medium text-text">E-mail de entrada</p>
          <p className="mt-1.5 text-sm text-text-strong">{user?.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" loading={loading}>
            Salvar nome
          </Button>
          <SavedNote show={saved} />
        </div>
      </form>
    </Section>
  );
}

/** Troca de e-mail: o Supabase manda os links de confirmação e só troca depois deles. */
export function EmailSection() {
  const { user, client } = useAuth();
  const [errors, setErrors] = useState<FieldErrors<{ email: string }>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setFormError(null);
    setSentTo(null);
    const result = validate(changeEmailSchema, Object.fromEntries(new FormData(form)));
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    if (result.data.email.toLowerCase() === user?.email.toLowerCase()) {
      setErrors({ email: 'Este já é o seu e-mail de entrada.' });
      return;
    }
    setErrors({});
    setLoading(true);
    const response = await client.updateEmail(result.data.email);
    setLoading(false);
    if (!response.ok) {
      setFormError(response.error);
      return;
    }
    form.reset();
    setSentTo(result.data.email);
  }

  return (
    <Section
      title="E-mail"
      description="Você entra no Trama com este endereço. Para trocar, confirmamos por e-mail."
    >
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
        {formError && <Alert tone="error">{formError}</Alert>}
        {sentTo && (
          <Alert tone="success" title="Confirme a troca">
            Enviamos um link de confirmação para {sentTo} e outro para {user?.email}. O e-mail só
            muda depois que você abrir os dois links. Até lá, continue entrando com o atual.
          </Alert>
        )}
        <TextField
          label="Novo e-mail"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="nome@exemplo.com"
          error={errors.email}
        />
        <div>
          <Button type="submit" loading={loading}>
            Trocar e-mail
          </Button>
        </div>
      </form>
    </Section>
  );
}

/** Troca de senha: confere a atual com um login e grava a nova com as regras do cadastro. */
export function PasswordSection() {
  const { user, client } = useAuth();
  const [errors, setErrors] = useState<
    FieldErrors<{ current: string; password: string; confirm: string }>
  >({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setFormError(null);
    setDone(false);
    const result = validate(changePasswordSchema, Object.fromEntries(new FormData(form)));
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      // Entrar de novo com a senha atual prova que quem está na tela sabe a senha.
      const check = await client.signIn({
        email: user?.email ?? '',
        password: result.data.current,
      });
      if (!check.ok) {
        if (check.error === INVALID_CREDENTIALS)
          setErrors({ current: 'A senha atual não confere.' });
        else setFormError(check.error);
        return;
      }
      const response = await client.updatePassword(result.data.password);
      if (!response.ok) {
        setFormError(response.error);
        return;
      }
      form.reset();
      setDone(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Section title="Senha" description="Para trocar, digite a senha de agora e escolha a nova.">
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
        {formError && <Alert tone="error">{formError}</Alert>}
        {done && (
          <Alert tone="success">Senha alterada. Da próxima vez, entre com a senha nova.</Alert>
        )}
        <PasswordField
          label="Senha atual"
          name="current"
          autoComplete="current-password"
          error={errors.current}
        />
        <PasswordField
          label="Senha nova"
          name="password"
          autoComplete="new-password"
          hint="Pelo menos 8 caracteres."
          error={errors.password}
        />
        <PasswordField
          label="Repita a senha nova"
          name="confirm"
          autoComplete="new-password"
          error={errors.confirm}
        />
        <div>
          <Button type="submit" loading={loading}>
            Trocar senha
          </Button>
        </div>
      </form>
    </Section>
  );
}

/** Fuso horário: salva ao escolher. Os do Brasil vêm primeiro. */
export function TimeZoneSection({ profile, api, onProfile }: ProfileSectionProps) {
  const id = useId();
  const groups = useMemo(
    () => groupTimeZones(browserTimeZones(), profile.timezone),
    [profile.timezone],
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function choose(timezone: string) {
    setSaved(false);
    const parsed = timeZoneSchema.safeParse(timezone);
    if (!parsed.success) {
      setError('Escolha um fuso horário da lista.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      onProfile(await api.updateProfile({ timezone: parsed.data }));
      setSaved(true);
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section
      title="Fuso horário"
      description="Usado nas datas e nos horários dos seus e-mails e da Agenda."
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-[13px] font-medium text-text">
          Seu fuso
        </label>
        <div className="flex items-center gap-3">
          <select
            id={id}
            value={profile.timezone}
            disabled={saving}
            onChange={(event) => void choose(event.target.value)}
            aria-invalid={error ? true : undefined}
            className="h-11 w-full max-w-sm rounded-control border border-border bg-field px-3 text-sm text-text-strong focus-visible:outline-2 focus-visible:outline-selection disabled:opacity-60"
          >
            <optgroup label="Brasil">
              {groups.brazil.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Outros fusos">
              {groups.others.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.label}
                </option>
              ))}
            </optgroup>
          </select>
          <SavedNote show={saved} />
        </div>
        {error && (
          <p role="alert" className="text-[13px] text-note-pink-fg">
            {error}
          </p>
        )}
      </div>
    </Section>
  );
}

const PREFERENCES: {
  key: keyof EmailPreferences;
  label: string;
  description: string;
}[] = [
  {
    key: 'weeklySummary',
    label: 'Resumo semanal',
    description: 'Um e-mail por semana com o que você estudou e o que vem pela frente.',
  },
  {
    key: 'reviewReminders',
    label: 'Lembrete de revisão',
    description: 'Um aviso no dia de revisar uma aula.',
  },
];

/** E-mails do Trama: cada chave liga e desliga na hora. */
export function EmailPreferencesSection({ profile, api, onProfile }: ProfileSectionProps) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function toggle(key: keyof EmailPreferences, value: boolean) {
    setSaved(false);
    setError(null);
    setSaving(true);
    const patch: UpdateProfileRequest = { emailPreferences: { [key]: value } };
    try {
      onProfile(await api.updateProfile(patch));
      setSaved(true);
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section
      title="E-mails do Trama"
      description="Os e-mails da conta, como a recuperação de senha e a confirmação de troca de e-mail, sempre saem: você pediu por eles."
    >
      {error && (
        <Alert tone="error" className="mb-2">
          {error}
        </Alert>
      )}
      <div className="divide-y divide-border-subtle">
        {PREFERENCES.map(({ key, label, description }) => (
          <Switch
            key={key}
            label={label}
            description={description}
            checked={profile.emailPreferences[key]}
            disabled={saving}
            onChange={(value) => void toggle(key, value)}
          />
        ))}
      </div>
      <div className="mt-2 h-5">
        <SavedNote show={saved} />
      </div>
    </Section>
  );
}

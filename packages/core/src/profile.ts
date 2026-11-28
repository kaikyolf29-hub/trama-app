import { z } from 'zod';

/**
 * Perfil da pessoa (etapa 2.5, docs/PLAN.md, "Tabelas principais"): espelha a tabela `profiles`
 * e o contrato de `GET` e `PATCH /account/profile`. O e-mail e a senha ficam no Supabase Auth,
 * não aqui.
 */

export const PROFILE_NAME_MAX = 80;
export const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';

/** O banco conta letras como o Postgres (`char_length`): um emoji é 1, não 2. */
const withinNameLimit = (name: string) => Array.from(name).length <= PROFILE_NAME_MAX;
const nameTooLong = `Use no máximo ${PROFILE_NAME_MAX} caracteres.`;

/** Nome ao editar: sem espaços nas pontas, de 1 a 80 letras. */
export const profileNameSchema = z
  .string()
  .trim()
  .min(1, 'Digite o seu nome.')
  .refine(withinNameLimit, nameTooLong);

/** Ao ler, o nome pode estar vazio (o gatilho do cadastro deixa '' quando não há nome). */
const storedNameSchema = z.string().refine(withinNameLimit, nameTooLong);

/** Se o motor do JavaScript conhece o fuso (nome IANA, como "America/Sao_Paulo"). */
export function isValidTimeZone(value: string): boolean {
  // Só nomes IANA: o Intl também aceita deslocamentos ("+03:00"), que não seguem o horário de verão.
  if (!/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Fuso horário IANA válido. */
export const timeZoneSchema = z
  .string()
  .max(64)
  .refine(isValidTimeZone, 'Escolha um fuso horário da lista.');

const emailPreferenceKeys = {
  /** Resumo dos estudos da semana (etapa 2.6). */
  weeklySummary: z.boolean(),
  /** Lembrete de revisão das aulas (etapa 2.6). */
  reviewReminders: z.boolean(),
};

/** Preferências de e-mail do Trama. Os e-mails da conta (recuperação de senha) não entram. */
export const emailPreferencesSchema = z.object({
  weeklySummary: emailPreferenceKeys.weeklySummary.default(true),
  reviewReminders: emailPreferenceKeys.reviewReminders.default(false),
});

export type EmailPreferences = z.infer<typeof emailPreferencesSchema>;

export const DEFAULT_EMAIL_PREFERENCES: EmailPreferences = {
  weeklySummary: true,
  reviewReminders: false,
};

/** O perfil que a API devolve. */
export const profileSchema = z.object({
  name: storedNameSchema,
  timezone: timeZoneSchema,
  emailPreferences: emailPreferencesSchema,
});

export type Profile = z.infer<typeof profileSchema>;

/**
 * `PATCH /account/profile`: ao menos um campo. `emailPreferences` pode trazer só a chave que
 * mudou; as outras ficam como estão.
 */
export const updateProfileRequestSchema = z
  .object({
    name: profileNameSchema.optional(),
    timezone: timeZoneSchema.optional(),
    emailPreferences: z.object(emailPreferenceKeys).partial().optional(),
  })
  .refine(
    (body) =>
      body.name !== undefined || body.timezone !== undefined || body.emailPreferences !== undefined,
    { message: 'informe o nome, o fuso ou as preferências de e-mail' },
  );

export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

/** Aplica um pedido de mudança ao perfil de agora (a mesma regra na API e nos testes). */
export function applyProfileUpdate(profile: Profile, patch: UpdateProfileRequest): Profile {
  return {
    name: patch.name ?? profile.name,
    timezone: patch.timezone ?? profile.timezone,
    emailPreferences: { ...profile.emailPreferences, ...patch.emailPreferences },
  };
}

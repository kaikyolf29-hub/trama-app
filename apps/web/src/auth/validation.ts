import { z } from 'zod';

/** O bcrypt do Supabase ignora o que passa de 72 bytes; recusamos antes. */
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;

const email = z
  .string()
  .trim()
  .min(1, 'Digite o seu e-mail.')
  .pipe(z.email('Digite um e-mail válido, como nome@exemplo.com.'));

const newPassword = z
  .string()
  .min(PASSWORD_MIN, `Use pelo menos ${PASSWORD_MIN} caracteres.`)
  .max(PASSWORD_MAX, `Use no máximo ${PASSWORD_MAX} caracteres.`);

export const signUpSchema = z.object({
  name: z.string().trim().min(1, 'Digite o seu nome.').max(80, 'Use no máximo 80 caracteres.'),
  email,
  password: newPassword,
});

export const signInSchema = z.object({
  email,
  password: z.string().min(1, 'Digite a sua senha.'),
});

export const changeEmailSchema = z.object({ email });

/** Trocar a senha: pede a atual e cria a nova com as mesmas regras do cadastro. */
export const changePasswordSchema = z
  .object({
    current: z.string().min(1, 'Digite a sua senha atual.'),
    password: newPassword,
    confirm: z.string().min(1, 'Repita a senha nova.'),
  })
  .refine((data) => data.password === data.confirm, {
    message: 'As senhas não são iguais.',
    path: ['confirm'],
  });

export const forgotPasswordSchema = z.object({ email });

export const newPasswordSchema = z
  .object({
    password: newPassword,
    confirm: z.string().min(1, 'Repita a senha nova.'),
  })
  .refine((data) => data.password === data.confirm, {
    message: 'As senhas não são iguais.',
    path: ['confirm'],
  });

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

/** Valida um formulário e devolve os dados ou a primeira mensagem de cada campo. */
export function validate<T extends z.ZodType>(
  schema: T,
  data: unknown,
): { ok: true; data: z.infer<T> } | { ok: false; errors: FieldErrors<z.infer<T>> } {
  const result = schema.safeParse(data);
  if (result.success) return { ok: true, data: result.data };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? '');
    errors[field] ??= issue.message;
  }
  return { ok: false, errors: errors as FieldErrors<z.infer<T>> };
}

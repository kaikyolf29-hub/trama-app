import { profileSchema, updateProfileRequestSchema } from '@trama/core';
import { renderWelcomeEmail } from '@trama/emails';
import { Hono, type Context } from 'hono';
import type { Deps } from '../deps';
import type { Env } from '../env';
import { appOrigin } from '../origin';

type AccountEnv = { Bindings: Env; Variables: { token: string; deps: Deps } };

const NO_PROFILE = 'Perfil não encontrado.';

/** Lê o corpo em JSON; corpo quebrado vira undefined (e a validação recusa). */
async function body(c: Context<AccountEnv>): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

/**
 * Rotas da conta: o perfil da pessoa (etapa 2.5) e as boas-vindas (etapa 1.6). O e-mail e a
 * senha são do Supabase Auth e o site os troca direto lá. Entrada e saída passam pelo core.
 */
export function accountRoutes() {
  const routes = new Hono<AccountEnv>();

  routes.get('/profile', async (c) => {
    const profile = await c.var.deps.account(c.env ?? {}, c.var.token).getProfile();
    if (!profile) return c.json({ error: NO_PROFILE }, 404);
    return c.json(profileSchema.parse(profile));
  });

  routes.patch('/profile', async (c) => {
    const parsed = updateProfileRequestSchema.safeParse(await body(c));
    if (!parsed.success) return c.json({ error: 'Dados do perfil inválidos.' }, 400);
    const store = c.var.deps.account(c.env ?? {}, c.var.token);
    const profile = await store.updateProfile(parsed.data);
    if (!profile) return c.json({ error: NO_PROFILE }, 404);
    return c.json(profileSchema.parse(profile));
  });

  /**
   * Boas-vindas: o site chama logo depois do cadastro (ou do primeiro login, quando o Supabase
   * pede para confirmar o e-mail antes), e o e-mail sai uma vez por pessoa. A reserva fica no
   * banco (`claim_welcome_email`), então chamar de novo não repete.
   */
  routes.post('/welcome', async (c) => {
    const { deps, token } = c.var;
    const env = c.env ?? {};
    const mailer = deps.mailer(env);
    // Sem Resend configurado, não reserva: assim o e-mail sai quando a chave chegar.
    if (!mailer.configured) return c.json({ sent: false });
    const siteUrl = appOrigin(c.req.header('Origin'), env);
    if (!siteUrl) return c.json({ sent: false });

    const identity = await deps.identity(env)(token);
    if (!identity.email) return c.json({ sent: false });

    const welcome = deps.welcome(env, token);
    if (!(await welcome.claim())) return c.json({ sent: false });
    try {
      const email = await renderWelcomeEmail({ name: identity.name, siteUrl });
      await mailer.send({ to: identity.email, ...email });
    } catch (error) {
      console.error('boas-vindas não saiu', error instanceof Error ? error.message : '');
      await welcome.release().catch(() => undefined);
      return c.json({ error: 'Não deu para enviar o e-mail de boas-vindas agora.' }, 502);
    }
    return c.json({ sent: true });
  });

  return routes;
}

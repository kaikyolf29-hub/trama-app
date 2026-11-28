import { renderWelcomeEmail } from '@trama/emails';
import { Hono } from 'hono';
import type { Deps } from '../deps';
import type { Env } from '../env';
import { appOrigin } from '../origin';

/**
 * Rotas da conta. Por enquanto, só as boas-vindas: o site chama logo depois do cadastro (ou do
 * primeiro login, quando o Supabase pede para confirmar o e-mail antes), e o e-mail sai uma vez
 * por pessoa. A reserva fica no banco (`claim_welcome_email`), então chamar de novo não repete.
 */
export function accountRoutes() {
  const routes = new Hono<{ Bindings: Env; Variables: { token: string; deps: Deps } }>();

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

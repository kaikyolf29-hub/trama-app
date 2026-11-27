import { Hono } from 'hono';

/** Variáveis e segredos do Worker (wrangler.jsonc e `wrangler secret put`). */
export interface Env {
  APP_URL?: string;
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
}

/**
 * A API do Trama: a única porta para o banco, o Drive, os e-mails e as IAs
 * (docs/PLAN.md, "Stack técnica e arquitetura"). As rotas chegam etapa por etapa.
 */
export const app = new Hono<{ Bindings: Env }>();

/** Para o deploy e o monitoramento conferirem que a API está de pé. */
app.get('/health', (c) => c.json({ ok: true, service: 'trama-api' }));

app.notFound((c) => c.json({ error: 'Rota não encontrada.' }, 404));

app.onError((error, c) => {
  console.error(error);
  return c.json({ error: 'Algo deu errado. Tente de novo em instantes.' }, 500);
});

export default app;

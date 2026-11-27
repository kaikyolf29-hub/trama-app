import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { projectRoutes } from './projects/routes';
import { SessionError, type ProjectStore } from './projects/store';
import { createSupabaseStore } from './projects/supabase-store';

/** Variáveis e segredos do Worker (wrangler.jsonc e `wrangler secret put`). */
export interface Env {
  APP_URL?: string;
  SUPABASE_URL?: string;
  /** Chave publicável (pública): com o token da pessoa, o banco aplica a RLS. */
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  /** Subdomínio workers.dev da conta: libera o site e os previews dos PRs no CORS. */
  WORKERS_SUBDOMAIN?: string;
}

/** Até 5 MB por pedido, o mesmo limite do conteúdo no banco. */
const MAX_BODY = 5 * 1024 * 1024;
const LOCAL_ORIGINS = new Set(['http://localhost:5173', 'http://127.0.0.1:5173']);

/** Só o site do Trama (produção e previews dos PRs) e o `pnpm dev` chamam a API. */
export function isAllowedOrigin(origin: string, env: Env): boolean {
  if (LOCAL_ORIGINS.has(origin)) return true;
  if (env.APP_URL && origin === new URL(env.APP_URL).origin) return true;
  const sub = env.WORKERS_SUBDOMAIN;
  if (!sub || !/^[a-z0-9-]+$/.test(sub)) return false;
  return new RegExp(`^https://(?:pr-\\d+-)?trama\\.${sub}\\.workers\\.dev$`).test(origin);
}

type StoreFactory = (env: Env, token: string) => ProjectStore;

const supabaseStore: StoreFactory = (env, token) => {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('Faltam SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY no Worker.');
  }
  return createSupabaseStore(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, token);
};

/**
 * A API do Trama: a única porta para o banco, o Drive, os e-mails e as IAs
 * (docs/PLAN.md, "Stack técnica e arquitetura"). `storeFor` existe para os testes.
 */
export function createApp(storeFor: StoreFactory = supabaseStore) {
  const app = new Hono<{ Bindings: Env; Variables: { store: ProjectStore } }>();

  app.use(
    '*',
    cors({
      // O contexto do CORS não carrega o tipo do app; o env é o mesmo do Worker.
      origin: (origin, c) => (isAllowedOrigin(origin, (c.env ?? {}) as Env) ? origin : null),
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type'],
      maxAge: 600,
    }),
  );

  /** Para o deploy e o monitoramento conferirem que a API está de pé. */
  app.get('/health', (c) => c.json({ ok: true, service: 'trama-api' }));

  app.use(
    '/projects/*',
    bodyLimit({
      maxSize: MAX_BODY,
      onError: (c) => c.json({ error: 'O projeto passou de 5 MB.' }, 413),
    }),
  );

  // Toda rota de projeto precisa do token de login (Supabase) da pessoa.
  app.use('/projects/*', async (c, next) => {
    const token = /^Bearer (\S+)$/.exec(c.req.header('Authorization') ?? '')?.[1];
    if (!token) return c.json({ error: 'Entre na sua conta para continuar.' }, 401);
    c.set('store', storeFor(c.env ?? {}, token));
    await next();
  });

  app.route('/projects', projectRoutes());

  app.notFound((c) => c.json({ error: 'Rota não encontrada.' }, 404));

  app.onError((error, c) => {
    if (error instanceof SessionError) {
      return c.json({ error: 'Sua sessão acabou. Entre de novo para continuar.' }, 401);
    }
    console.error(error);
    return c.json({ error: 'Algo deu errado. Tente de novo em instantes.' }, 500);
  });

  return app;
}

export const app = createApp();

export default app;

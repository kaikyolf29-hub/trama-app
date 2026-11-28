import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { aiRoutes } from './ai/routes';
import { accountRoutes } from './account/routes';
import { defaultDeps, type Deps } from './deps';
import { driveRoutes } from './drive/routes';
import type { Env } from './env';
import { eventRoutes, lessonRoutes } from './organization/routes';
import type { OrganizationStore } from './organization/store';
import { isAllowedOrigin } from './origin';
import { projectRoutes } from './projects/routes';
import { SessionError, type ProjectStore } from './projects/store';

export type { Env } from './env';
export { isAllowedOrigin } from './origin';

/** Até 5 MB por pedido, o mesmo limite do conteúdo no banco. */
const MAX_BODY = 5 * 1024 * 1024;

type StoreFactory = (env: Env, token: string) => ProjectStore;

type Variables = {
  store: ProjectStore;
  organization: OrganizationStore;
  token: string;
  deps: Deps;
};

/**
 * A API do Trama: a única porta para o banco, o Drive, os e-mails e as IAs
 * (docs/PLAN.md, "Stack técnica e arquitetura"). `storeFor` e `overrides` existem para os
 * testes trocarem o banco, o Google e o Resend por versões falsas.
 */
export function createApp(storeFor?: StoreFactory, overrides: Partial<Deps> = {}) {
  const deps: Deps = {
    ...defaultDeps(),
    ...(storeFor ? { projects: storeFor } : {}),
    ...overrides,
  };
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();

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
  // Agenda e aulas só recebem textos curtos (as notas de uma aula chegam a 20.000 letras).
  for (const prefix of ['/events/*', '/notebooks/*']) {
    app.use(
      prefix,
      bodyLimit({
        maxSize: 256 * 1024,
        onError: (c) => c.json({ error: 'O pedido passou de 256 KB.' }, 413),
      }),
    );
  }
  // Drive e conta só trocam pedidos pequenos (ids, bilhete); o conteúdo grande vem do Google.
  for (const prefix of ['/drive/*', '/account/*']) {
    app.use(
      prefix,
      bodyLimit({
        maxSize: 64 * 1024,
        onError: (c) => c.json({ error: 'Pedido grande demais.' }, 413),
      }),
    );
  }

  // O texto a organizar tem até 20 mil caracteres (até 4 bytes cada, em UTF-8) e vai em JSON.
  app.use(
    '/ai/*',
    bodyLimit({
      maxSize: 128 * 1024,
      onError: (c) => c.json({ error: 'Pedido grande demais.' }, 413),
    }),
  );

  // Quase toda rota precisa do token de login (Supabase) da pessoa. A exceção é o retorno do
  // Google (`/drive/callback`), que chega do navegador sem ele (veja drive/routes.ts).
  app.use('*', async (c, next) => {
    const path = new URL(c.req.url).pathname;
    const needsLogin =
      path.startsWith('/projects') ||
      path.startsWith('/events') ||
      path.startsWith('/notebooks') ||
      path.startsWith('/account') ||
      path.startsWith('/ai') ||
      (path.startsWith('/drive') && path !== '/drive/callback');
    c.set('deps', deps);
    if (!needsLogin || c.req.method === 'OPTIONS') return next();
    const token = /^Bearer (\S+)$/.exec(c.req.header('Authorization') ?? '')?.[1];
    if (!token) return c.json({ error: 'Entre na sua conta para continuar.' }, 401);
    c.set('token', token);
    if (path.startsWith('/projects')) c.set('store', deps.projects(c.env ?? {}, token));
    if (path.startsWith('/events') || path.startsWith('/notebooks')) {
      c.set('organization', deps.organization(c.env ?? {}, token));
    }
    await next();
  });

  app.route('/projects', projectRoutes());
  app.route('/events', eventRoutes());
  app.route('/notebooks', lessonRoutes());
  app.route('/drive', driveRoutes());
  app.route('/account', accountRoutes());
  app.route('/ai', aiRoutes());

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

import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  type RouterHistory,
} from '@tanstack/react-router';
import { safeReturnPath } from './auth/return-path';
import type { AuthClient } from './auth/types';
import { DesignPreview } from './DesignPreview';
import { AgendaPage } from './pages/agenda/AgendaPage';
import { DriveReturnPage } from './pages/DriveReturnPage';
import { ExampleBoardPage } from './pages/ExampleBoardPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { HomePage } from './pages/HomePage';
import { NewPasswordPage } from './pages/NewPasswordPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProjectPage } from './pages/ProjectPage';
import { SignInPage } from './pages/SignInPage';
import { SignUpPage } from './pages/SignUpPage';

export interface RouterContext {
  auth: AuthClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: NotFoundPage,
});

// As guardas perguntam ao cliente, e não ao estado do React: logo depois do login o
// estado ainda pode estar atrasado, e a pessoa voltaria para /entrar.
const signedInOnly = async ({
  context,
  location,
}: {
  context: RouterContext;
  location: { href: string };
}) => {
  if (!(await context.auth.getUser())) {
    throw redirect({ to: '/entrar', search: { volta: location.href } });
  }
};

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: signedInOnly,
  component: HomePage,
});

/** A Agenda: o que a pessoa criou, terminou ou estudou, por dia (etapa 2.2). */
const agendaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/agenda',
  beforeLoad: signedInOnly,
  component: AgendaPage,
});

/** Um projeto aberto no quadro (etapa 1.5). */
const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/p/$projectId',
  beforeLoad: signedInOnly,
  component: ProjectPage,
});

/** Para onde o Google devolve a pessoa depois de conectar o Drive (etapa 1.6). */
const driveReturnRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/drive/retorno',
  validateSearch: (search: Record<string, unknown>): { erro?: string; volta?: string } => ({
    erro: typeof search.erro === 'string' && search.erro ? search.erro : undefined,
    volta: safeReturnPath(search.volta),
  }),
  beforeLoad: signedInOnly,
  component: DriveReturnPage,
});

const guestOnly = async ({ context }: { context: RouterContext }) => {
  if (await context.auth.getUser()) throw redirect({ to: '/' });
};

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/entrar',
  // O TanStack Router mantém os parâmetros originais e só sobrepõe o que esta função
  // devolve: por isso `volta: undefined` explícito, e não um objeto vazio.
  validateSearch: (search: Record<string, unknown>): { volta?: string } => ({
    volta: safeReturnPath(search.volta),
  }),
  beforeLoad: guestOnly,
  component: SignInPage,
});

const signUpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/criar-conta',
  beforeLoad: guestOnly,
  component: SignUpPage,
});

const forgotPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/esqueci-a-senha',
  component: ForgotPasswordPage,
});

const newPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/nova-senha',
  validateSearch: (search: Record<string, unknown>): { token_hash?: string } => ({
    token_hash:
      typeof search.token_hash === 'string' && search.token_hash ? search.token_hash : undefined,
  }),
  component: NewPasswordPage,
});

const exampleBoardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/exemplo',
  component: ExampleBoardPage,
});

const designRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/design',
  component: DesignPreview,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  agendaRoute,
  projectRoute,
  driveReturnRoute,
  signInRoute,
  signUpRoute,
  forgotPasswordRoute,
  newPasswordRoute,
  exampleBoardRoute,
  designRoute,
]);

export function createAppRouter(auth: AuthClient, history?: RouterHistory) {
  return createRouter({
    routeTree,
    context: { auth },
    history,
    defaultPreload: 'intent',
    scrollRestoration: true,
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}

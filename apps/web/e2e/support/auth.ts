import type { Page, Route } from '@playwright/test';

/** O Supabase do projeto "trama": nunca é chamado de verdade nos testes. */
export const SUPABASE_URL = 'https://jebksiyftodpbvhndoqf.supabase.co';
/** Onde o supabase-js guarda a sessão (`sb-<ref>-auth-token`). */
export const SESSION_KEY = 'sb-jebksiyftodpbvhndoqf-auth-token';

export interface TestUser {
  id: string;
  email: string;
  name: string;
}

export const testUser: TestUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'ana@exemplo.com',
  name: 'Ana Souza',
};

const base64Url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** Um JWT de mentira (só o formato): o site nunca confere a assinatura. */
function fakeJwt(user: TestUser, expiresAt: number) {
  const header = base64Url({ alg: 'HS256', typ: 'JWT' });
  const payload = base64Url({
    sub: user.id,
    email: user.email,
    role: 'authenticated',
    aud: 'authenticated',
    exp: expiresAt,
  });
  return `${header}.${payload}.assinatura-falsa`;
}

function authUser(user: TestUser) {
  return {
    id: user.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: user.email,
    app_metadata: { provider: 'email' },
    user_metadata: { name: user.name },
    created_at: '2026-11-01T12:00:00.000Z',
  };
}

/** A sessão como o Supabase Auth a devolve (e como o supabase-js a guarda). */
export function fakeSession(user: TestUser = testUser) {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: fakeJwt(user, expiresAt),
    refresh_token: 'refresh-falso',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt,
    user: authUser(user),
  };
}

/** Bloqueia o Supabase de verdade: qualquer pedido que escape dos simulados falha na hora. */
export async function blockSupabase(page: Page) {
  await page.route(`${SUPABASE_URL}/**`, (route) => route.abort('blockedbyclient'));
}

/**
 * Deixa a pessoa já logada: grava uma sessão falsa no localStorage antes de a página carregar.
 * Só grava se ainda não houver sessão, para "Sair" continuar valendo depois de recarregar.
 */
export async function signedInAs(page: Page, user: TestUser = testUser) {
  const session = fakeSession(user);
  await page.addInitScript(
    ([key, value]) => {
      if (!localStorage.getItem(key as string))
        localStorage.setItem(key as string, value as string);
    },
    [SESSION_KEY, JSON.stringify(session)],
  );
}

const jsonHeaders = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };

/** O que o Supabase Auth simulado faz com o login e o cadastro. */
export interface AuthMock {
  /** E-mail e senha aceitos no login; qualquer outra combinação é recusada. */
  validLogin: { email: string; password: string };
  /** O cadastro pede confirmação por e-mail (sem sessão) ou já entra? */
  signUpNeedsConfirmation: boolean;
  /** Corpos recebidos, para conferir. */
  signInBodies: unknown[];
  signUpBodies: unknown[];
}

/**
 * Simula `POST /auth/v1/token` (login por e-mail e senha), `POST /auth/v1/signup` e `/auth/v1/logout`,
 * por cima do bloqueio do Supabase.
 */
export async function mockSupabaseAuth(
  page: Page,
  options: Partial<Pick<AuthMock, 'validLogin' | 'signUpNeedsConfirmation'>> = {},
): Promise<AuthMock> {
  const mock: AuthMock = {
    validLogin: { email: testUser.email, password: 'senha-certa-123' },
    signUpNeedsConfirmation: true,
    signInBodies: [],
    signUpBodies: [],
    ...options,
  };
  const reply = (route: Route, status: number, body: unknown) =>
    route.fulfill({ status, headers: jsonHeaders, body: JSON.stringify(body) });

  await page.route(`${SUPABASE_URL}/auth/v1/token**`, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': '*',
        },
      });
    }
    const body = route.request().postDataJSON() as { email?: string; password?: string };
    mock.signInBodies.push(body);
    if (body.email === mock.validLogin.email && body.password === mock.validLogin.password) {
      return reply(route, 200, fakeSession({ ...testUser, email: body.email }));
    }
    return reply(route, 400, {
      code: 400,
      error_code: 'invalid_credentials',
      msg: 'Invalid login credentials',
    });
  });

  await page.route(`${SUPABASE_URL}/auth/v1/signup**`, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': '*',
        },
      });
    }
    const body = route.request().postDataJSON() as {
      email: string;
      data?: { name?: string };
    };
    mock.signUpBodies.push(body);
    const user = { ...testUser, email: body.email, name: body.data?.name ?? '' };
    if (mock.signUpNeedsConfirmation) {
      // Sem sessão: o e-mail de confirmação ainda precisa ser aberto.
      return reply(route, 200, authUser(user));
    }
    return reply(route, 200, fakeSession(user));
  });

  // Sair: o supabase-js avisa o servidor e apaga a sessão local.
  await page.route(`${SUPABASE_URL}/auth/v1/logout**`, (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({
          status: 204,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-headers': '*',
            'access-control-allow-methods': '*',
          },
        })
      : route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } }),
  );

  return mock;
}

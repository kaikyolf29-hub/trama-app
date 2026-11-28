import { jsonOf } from './json';

/**
 * Uma imitação do Supabase Auth, só com o que o conector usa: `GET /auth/v1/user` e
 * `POST /auth/v1/token?grant_type=refresh_token`. Cada refresh token vale uma vez (como no
 * Supabase, que troca o token a cada uso), e é possível encerrar a sessão de uma pessoa.
 */
export function createFakeSupabase(options: { expiresIn?: number } = {}) {
  const expiresIn = options.expiresIn ?? 3600;
  const accessTokens = new Map<string, string>(); // access token -> id da pessoa
  const refreshTokens = new Map<string, { userId: string; used: boolean }>();
  const ended = new Set<string>();
  let counter = 0;
  const log: { path: string; auth: string | null }[] = [];
  let down = false;

  const issue = (userId: string) => {
    const n = ++counter;
    const accessToken = `acesso-${String(n)}-${userId}`;
    const refreshToken = `refresh-${String(n)}-${userId}`;
    accessTokens.set(accessToken, userId);
    refreshTokens.set(refreshToken, { userId, used: false });
    return { accessToken, refreshToken };
  };

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const fetcher: typeof fetch = (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    log.push({ path: url.pathname + url.search, auth: request.headers.get('Authorization') });
    return Promise.resolve().then(async () => {
      if (down) return json(503, { error: 'indisponível' });
      if (!request.headers.get('apikey')) return json(401, { error: 'sem apikey' });
      if (url.pathname === '/auth/v1/user') {
        const token = /^Bearer (\S+)$/.exec(request.headers.get('Authorization') ?? '')?.[1] ?? '';
        const userId = accessTokens.get(token);
        if (!userId || ended.has(userId)) return json(401, { error: 'token inválido' });
        return json(200, { id: userId, email: `${userId}@exemplo.test` });
      }
      if (
        url.pathname === '/auth/v1/token' &&
        url.searchParams.get('grant_type') === 'refresh_token'
      ) {
        const body = await jsonOf<{ refresh_token?: string }>(request);
        const entry = refreshTokens.get(body.refresh_token ?? '');
        if (!entry || entry.used || ended.has(entry.userId)) {
          return json(400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' });
        }
        entry.used = true;
        const next = issue(entry.userId);
        return json(200, {
          access_token: next.accessToken,
          refresh_token: next.refreshToken,
          expires_in: expiresIn,
          token_type: 'bearer',
          user: { id: entry.userId },
        });
      }
      return json(404, { error: 'rota desconhecida' });
    });
  };

  return {
    fetch: fetcher,
    /** Abre uma sessão nova para a pessoa (o que o site faz com a senha na tela de consentimento). */
    signIn: issue,
    /** A pessoa saiu de todas as sessões: nenhum token dela vale mais. */
    endSessions(userId: string) {
      ended.add(userId);
    },
    /** O Supabase fora do ar. */
    setDown(value: boolean) {
      down = value;
    },
    log,
  };
}

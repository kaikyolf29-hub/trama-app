import {
  driveConnectRequestSchema,
  driveFinishRequestSchema,
  driveImportRequestSchema,
  type DriveStatus,
} from '@trama/core';
import { renderDriveNoticeEmail } from '@trama/emails';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Deps } from '../deps';
import type { Env } from '../env';
import { appOrigin, safePath } from '../origin';
import { GoogleError } from './google';
import type { DriveConnection } from './store';
import {
  accessTokenFor,
  copyProjectToDrive,
  describeGoogleError,
  importFromDrive,
  InvalidFileError,
  InvalidProjectError,
} from './sync';
import {
  createState,
  createTicket,
  openRefreshToken,
  openTicket,
  readState,
  sealRefreshToken,
} from './tickets';
import { CryptoError } from './vault';

/** Quantas cópias seguidas precisam falhar para o aviso sair por e-mail (docs/PLAN.md). */
export const FAILURES_BEFORE_EMAIL = 3;

export type DriveVariables = { token: string; deps: Deps };
type Ctx = Context<{ Bindings: Env; Variables: DriveVariables }>;

const idSchema = z.uuid();

async function body(c: Ctx): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

/**
 * O `sub` do token de login, sem conferir a assinatura. Serve só de dado associado ao decifrar
 * o refresh token: antes disso, a leitura da conexão no banco já passou pela RLS com o mesmo
 * token, e um token falso nem chega aqui. Onde a identidade importa de verdade (ligar o `state`
 * à pessoa, receber o bilhete), usa-se a conferida pelo Supabase Auth.
 */
export function jwtSubject(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replaceAll('-', '+').replaceAll('_', '/'))) as {
      sub?: unknown;
    };
    return typeof json.sub === 'string' ? json.sub : null;
  } catch {
    return null;
  }
}

function statusOf(connection: DriveConnection | null, available: boolean): DriveStatus {
  return {
    available,
    connected: connection !== null,
    email: connection?.email ?? null,
    folderUrl: connection?.rootFolderId
      ? `https://drive.google.com/drive/folders/${connection.rootFolderId}`
      : null,
    lastCopyAt: connection?.lastCopyAt ?? null,
    consecutiveFailures: connection?.consecutiveFailures ?? 0,
    lastError: connection?.lastError ?? null,
  };
}

const NOT_CONFIGURED = 'O Drive ainda não está ligado neste ambiente.';
const NOT_CONNECTED = 'O Google Drive não está conectado.';

/**
 * Rotas do Google Drive (docs/PLAN.md, etapa 1.6). Tudo exige o token de login, menos
 * `/callback`, que é para onde o Google devolve o navegador.
 */
export function driveRoutes() {
  const routes = new Hono<{ Bindings: Env; Variables: DriveVariables }>();

  /** O que quase toda rota precisa: Google, cofre, conexão da pessoa e quem ela é. */
  async function session(c: Ctx) {
    const { deps, token } = c.var;
    const env = c.env ?? {};
    const google = deps.google(env);
    const vault = await deps.vault(env);
    if (!google || !vault) return { ok: false as const, response: c.json({ error: NOT_CONFIGURED }, 503) };
    const drive = deps.drive(env, token);
    const connection = await drive.get();
    if (!connection) return { ok: false as const, response: c.json({ error: NOT_CONNECTED }, 409) };
    const uid = jwtSubject(token);
    if (!uid) return { ok: false as const, response: c.json({ error: NOT_CONNECTED }, 409) };
    return {
      ok: true as const,
      ctx: {
        google,
        vault,
        drive,
        projects: deps.projects(env, token),
        uid,
        connection,
        now: deps.now(),
      },
    };
  }

  /** Começa a conectar: devolve o endereço da tela de consentimento do Google. */
  routes.post('/connect', async (c) => {
    const { deps, token } = c.var;
    const env = c.env ?? {};
    const google = deps.google(env);
    const vault = await deps.vault(env);
    if (!google || !vault) return c.json({ error: NOT_CONFIGURED }, 503);
    const raw = await body(c);
    const request = driveConnectRequestSchema.safeParse(raw ?? {});
    if (!request.success) return c.json({ error: 'Pedido inválido.' }, 400);
    const origin = appOrigin(c.req.header('Origin'), env);
    if (!origin) return c.json({ error: 'Faltam o endereço do site (APP_URL) na API.' }, 500);
    const identity = await deps.identity(env)(token);
    const state = await createState(
      vault,
      { uid: identity.id, origin, returnTo: safePath(request.data.returnTo) },
      deps.now().getTime(),
    );
    const redirectUri = `${new URL(c.req.url).origin}/drive/callback`;
    return c.json({ url: google.authUrl({ redirectUri, state }) });
  });

  /**
   * Para onde o Google devolve o navegador. Não há token de login aqui, então nada é gravado:
   * troca o código, cifra o refresh token num bilhete preso à pessoa do `state` e manda o site
   * entregá-lo em `POST /drive/connection`.
   */
  routes.get('/callback', async (c) => {
    const { deps } = c.var;
    const env = c.env ?? {};
    const google = deps.google(env);
    const vault = await deps.vault(env);
    if (!google || !vault) return c.json({ error: NOT_CONFIGURED }, 503);
    const state = await readState(vault, c.req.query('state') ?? '', deps.now().getTime());
    if (!state) {
      return c.json(
        { error: 'O link de conexão venceu ou não é válido. Volte ao Trama e tente de novo.' },
        400,
      );
    }
    const back = (hash: string, query: Record<string, string>) => {
      const url = new URL('/drive/retorno', state.origin);
      for (const [key, value] of Object.entries({ volta: state.returnTo, ...query })) {
        url.searchParams.set(key, value);
      }
      url.hash = hash;
      c.header('Cache-Control', 'no-store');
      c.header('Referrer-Policy', 'no-referrer');
      return c.redirect(url.toString(), 302);
    };

    const googleError = c.req.query('error');
    if (googleError) return back('', { erro: googleError === 'access_denied' ? 'negado' : 'falhou' });
    const code = c.req.query('code');
    if (!code) return back('', { erro: 'falhou' });

    try {
      const redirectUri = `${new URL(c.req.url).origin}/drive/callback`;
      const tokens = await google.exchangeCode(code, redirectUri);
      if (!tokens.refreshToken) return back('', { erro: 'falhou' });
      const email = await google.accountEmail(tokens.accessToken).catch(() => null);
      const ticket = await createTicket(
        vault,
        state.uid,
        { refreshToken: tokens.refreshToken, email },
        deps.now().getTime(),
      );
      return back(`t=${ticket}`, {});
    } catch (error) {
      console.error('troca do código do Google falhou', error instanceof Error ? error.message : '');
      return back('', { erro: 'falhou' });
    }
  });

  /** O site entrega o bilhete; a conexão é gravada com o token da pessoa (RLS). */
  routes.post('/connection', async (c) => {
    const { deps, token } = c.var;
    const env = c.env ?? {};
    const vault = await deps.vault(env);
    if (!vault) return c.json({ error: NOT_CONFIGURED }, 503);
    const request = driveFinishRequestSchema.safeParse(await body(c));
    if (!request.success) return c.json({ error: 'Pedido inválido.' }, 400);
    const identity = await deps.identity(env)(token);
    const ticket = await openTicket(vault, identity.id, request.data.ticket, deps.now().getTime());
    if (!ticket) {
      return c.json({ error: 'A volta do Google venceu. Conecte o Drive de novo.' }, 400);
    }
    const drive = deps.drive(env, token);
    await drive.connect({
      email: ticket.email,
      refreshTokenEncrypted: await sealRefreshToken(vault, identity.id, ticket.refreshToken),
    });
    return c.json(statusOf(await drive.get(), true));
  });

  routes.get('/status', async (c) => {
    const { deps, token } = c.var;
    const env = c.env ?? {};
    const available = deps.google(env) !== null && (await deps.vault(env)) !== null;
    return c.json(statusOf(await deps.drive(env, token).get(), available));
  });

  /** Desconectar: revoga o acesso no Google (se der) e apaga a conexão. Os arquivos ficam no Drive. */
  routes.delete('/', async (c) => {
    const { deps, token } = c.var;
    const env = c.env ?? {};
    const drive = deps.drive(env, token);
    const connection = await drive.get();
    if (connection) {
      const google = deps.google(env);
      const vault = await deps.vault(env);
      const uid = jwtSubject(token);
      if (google && vault && uid) {
        try {
          await google.revoke(await openRefreshToken(vault, uid, connection.refreshTokenEncrypted));
        } catch (error) {
          // Revogar é um favor ao Google; o que importa é apagar a conexão daqui.
          console.error('não deu para revogar o acesso', error instanceof Error ? error.message : '');
        }
      }
      await drive.disconnect();
    }
    return c.body(null, 204);
  });

  /** Copia um projeto para o Drive; conta as falhas seguidas e avisa por e-mail na terceira. */
  routes.post('/projects/:id/copy', async (c) => {
    const id = idSchema.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'Projeto não encontrado.' }, 404);
    const s = await session(c);
    if (!s.ok) return s.response;
    const { ctx } = s;
    const project = await ctx.projects.get(id.data);
    if (!project) return c.json({ error: 'Projeto não encontrado.' }, 404);
    if (project.kind !== 'flow') {
      return c.json({ error: 'Por enquanto só os fluxos vão para o Drive.' }, 422);
    }
    try {
      const copied = await copyProjectToDrive(ctx, project);
      await ctx.drive.recordCopy(true);
      return c.json(copied);
    } catch (error) {
      if (error instanceof InvalidProjectError) {
        return c.json({ error: 'Este projeto tem um conteúdo que o Trama não entende.' }, 422);
      }
      if (!(error instanceof GoogleError) && !(error instanceof CryptoError)) throw error;
      console.error('cópia para o Drive falhou', error.name, error.message);
      const message = describeGoogleError(error);
      const { consecutiveFailures } = await ctx.drive.recordCopy(false, message);
      if (consecutiveFailures === FAILURES_BEFORE_EMAIL) await sendDriveNotice(c, message);
      return c.json({ error: message }, 502);
    }
  });

  /** Token de acesso curto para o Picker do navegador (escopo drive.file, vale ~1 hora). */
  routes.post('/picker-token', async (c) => {
    const s = await session(c);
    if (!s.ok) return s.response;
    try {
      const { accessToken, expiresIn } = await accessTokenFor(s.ctx);
      c.header('Cache-Control', 'no-store');
      return c.json({ accessToken, expiresIn: Math.max(1, Math.floor(expiresIn)) });
    } catch (error) {
      if (!(error instanceof GoogleError) && !(error instanceof CryptoError)) throw error;
      return c.json({ error: describeGoogleError(error) }, 502);
    }
  });

  /** "Abrir do Drive": importa o `projeto.trama` que a pessoa escolheu no Picker. */
  routes.post('/import', async (c) => {
    const request = driveImportRequestSchema.safeParse(await body(c));
    if (!request.success) return c.json({ error: 'Arquivo do Drive inválido.' }, 400);
    const s = await session(c);
    if (!s.ok) return s.response;
    try {
      return c.json(await importFromDrive(s.ctx, request.data.fileId));
    } catch (error) {
      if (error instanceof InvalidFileError) return c.json({ error: error.message }, error.status);
      if (!(error instanceof GoogleError) && !(error instanceof CryptoError)) throw error;
      console.error('importação do Drive falhou', error.name, error.message);
      return c.json({ error: 'Não deu para abrir o arquivo do Drive agora.' }, 502);
    }
  });

  return routes;
}

/** O "Aviso do Drive". Falha de e-mail não pode derrubar a resposta da cópia. */
async function sendDriveNotice(c: Ctx, reason: string): Promise<void> {
  const { deps, token } = c.var;
  const env = c.env ?? {};
  try {
    const mailer = deps.mailer(env);
    if (!mailer.configured) {
      console.warn('Aviso do Drive não enviado: faltam RESEND_API_KEY e EMAIL_FROM.');
      return;
    }
    const identity = await deps.identity(env)(token);
    if (!identity.email) return;
    const siteUrl = appOrigin(c.req.header('Origin'), env);
    if (!siteUrl) return;
    const email = await renderDriveNoticeEmail({ name: identity.name, siteUrl, reason });
    await mailer.send({ to: identity.email, ...email });
  } catch (error) {
    console.error('Aviso do Drive não saiu', error instanceof Error ? error.message : '');
  }
}

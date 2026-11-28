import { colors, fonts } from '@trama/ui/tokens';
import { Hono, type Context } from 'hono';
import type { Vault } from '../drive/vault';
import type { Deps } from '../deps';
import type { Env } from '../env';
import { preferenceOf, type DigestKind } from './store';

const PREFIX = 'unsub:';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * O link de descadastro: `userId` e o tipo de e-mail, assinados com a chave derivada da
 * `TOKEN_ENCRYPTION_KEY` (HMAC-SHA-256, a mesma subchave do `state` do Drive; o prefixo `unsub:`
 * mantém os dois usos separados). Não vence: um e-mail antigo continua desligando a opção.
 * Só carrega o id da pessoa (que já é opaco) e o tipo; não dá acesso a nada além de desligar.
 */
export async function createUnsubscribeToken(
  vault: Vault,
  userId: string,
  kind: DigestKind,
): Promise<string> {
  return vault.sign(`${PREFIX}${userId}:${kind}`);
}

export interface UnsubscribeTarget {
  userId: string;
  kind: DigestKind;
}

/** Confere a assinatura e devolve a quem e a qual e-mail o link se refere (ou null). */
export async function readUnsubscribeToken(
  vault: Vault,
  token: string,
): Promise<UnsubscribeTarget | null> {
  const payload = await vault.verify(token);
  if (!payload?.startsWith(PREFIX)) return null;
  const [userId, kind, extra] = payload.slice(PREFIX.length).split(':');
  if (extra !== undefined || !userId || !UUID.test(userId)) return null;
  if (kind !== 'weekly_summary' && kind !== 'review_reminder') return null;
  return { userId, kind };
}

/** O endereço público da API: `API_URL`, ou o workers.dev da conta. Sem nenhum, `null`. */
export function apiBaseUrl(env: Pick<Env, 'API_URL' | 'WORKERS_SUBDOMAIN'>): string | null {
  if (env.API_URL) return env.API_URL.replace(/\/$/, '');
  if (env.WORKERS_SUBDOMAIN) return `https://trama-api.${env.WORKERS_SUBDOMAIN}.workers.dev`;
  return null;
}

/** O endereço do site: `APP_URL`, ou o workers.dev da conta (`trama.<subdomínio>`). Sem nenhum, `null`. */
export function siteBaseUrl(env: Pick<Env, 'APP_URL' | 'WORKERS_SUBDOMAIN'>): string | null {
  if (env.APP_URL) return new URL(env.APP_URL).origin;
  if (env.WORKERS_SUBDOMAIN) return `https://trama.${env.WORKERS_SUBDOMAIN}.workers.dev`;
  return null;
}

/** O link que vai no e-mail. */
export function unsubscribeUrl(apiUrl: string, token: string): string {
  return `${apiUrl}/unsubscribe?t=${encodeURIComponent(token)}`;
}

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`);

function page(title: string, message: string, link?: { href: string; label: string }): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escape(title)} · Trama</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: ${colors.canvas}; color: ${colors.text}; font-family: ${fonts.sans}; padding: 16px; box-sizing: border-box; }
  main { max-width: 440px; background: ${colors.surface}; border: 1px solid ${colors.border};
    border-radius: 12px; padding: 32px 28px; }
  h1 { margin: 0 0 12px; font-family: ${fonts.serif}; font-size: 24px; font-weight: 600; color: ${colors.textStrong}; }
  p { margin: 0 0 16px; font-size: 15px; line-height: 24px; }
  a { display: inline-block; background: ${colors.textStrong}; color: ${colors.brandInk}; border-radius: 8px;
    padding: 12px 20px; font-size: 15px; font-weight: 600; text-decoration: none; }
  a:focus-visible { outline: 2px solid ${colors.selection}; outline-offset: 2px; }
</style>
</head>
<body>
<main>
<h1>${escape(title)}</h1>
<p>${escape(message)}</p>
${link ? `<a href="${escape(link.href)}">${escape(link.label)}</a>` : ''}
</main>
</body>
</html>`;
}

const MESSAGES: Record<DigestKind, { title: string; message: string }> = {
  weekly_summary: {
    title: 'Resumo semanal desligado',
    message:
      'Pronto: você não vai mais receber o resumo semanal de estudos. Para voltar a receber, ligue de novo em Configurações.',
  },
  review_reminder: {
    title: 'Lembrete de revisão desligado',
    message:
      'Pronto: você não vai mais receber o lembrete de revisão. Para voltar a receber, ligue de novo em Configurações.',
  },
};

type Variables = { deps: Deps };

/**
 * `GET` e `POST /unsubscribe?t=<token>`, públicas (sem login): o link do e-mail chega do
 * navegador sem o token da pessoa. Desligam só a preferência do tipo de e-mail do link e mostram
 * uma página de confirmação. `POST` existe para o `List-Unsubscribe-Post` (um clique, no próprio
 * programa de e-mail).
 */
export function unsubscribeRoutes() {
  const routes = new Hono<{ Bindings: Env; Variables: Variables }>();

  const handle = async (c: Context<{ Bindings: Env; Variables: Variables }>) => {
    const headers = {
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    };
    const env = c.env ?? {};
    const { deps } = c.var;
    const home = siteBaseUrl(env);
    const settings = home
      ? { href: `${home}/configuracoes`, label: 'Abrir as Configurações' }
      : undefined;

    const [vault, store] = [await deps.vault(env), deps.digest(env)];
    if (!vault || !store) {
      return c.html(
        page(
          'Não deu agora',
          'O descadastro não está disponível neste momento. Tente de novo mais tarde.',
        ),
        503,
        headers,
      );
    }
    const target = await readUnsubscribeToken(vault, c.req.query('t') ?? '');
    if (!target) {
      return c.html(
        page(
          'Link inválido',
          'Este link de descadastro não vale (está incompleto ou foi alterado). Para desligar os e-mails, abra as Configurações do Trama.',
          settings,
        ),
        400,
        headers,
      );
    }
    try {
      await store.setPreference(target.userId, preferenceOf[target.kind], false);
    } catch {
      // Sem dado pessoal no log: só o tipo do e-mail.
      console.error('descadastro: não deu para gravar', target.kind);
      return c.html(
        page('Não deu agora', 'Não deu para desligar o e-mail agora. Tente de novo em instantes.'),
        500,
        headers,
      );
    }
    const { title, message } = MESSAGES[target.kind];
    return c.html(page(title, message, settings), 200, headers);
  };

  routes.get('/', handle);
  routes.post('/', handle);
  return routes;
}

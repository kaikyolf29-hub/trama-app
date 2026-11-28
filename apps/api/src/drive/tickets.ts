import { z } from 'zod';
import { fromBase64Url, toBase64Url, type Vault } from './vault';

/**
 * O `state` do OAuth e o "bilhete" de retorno.
 *
 * - `state`: assinado (HMAC) e preso à pessoa que começou a conectar, com validade de 10 minutos.
 *   Quem tenta completar uma conexão iniciada por outra pessoa (CSRF) esbarra no bilhete.
 * - bilhete: o refresh token que o Google devolveu, criptografado com o id da pessoa como dado
 *   associado e com validade de 10 minutos. O callback do Google não traz o token de login da
 *   pessoa, então ele não grava nada: manda o bilhete ao site, que o entrega à API junto com o
 *   token de login, e só então a conexão é gravada (com a RLS, sem a chave secreta do Supabase).
 */

export const STATE_TTL_MS = 10 * 60 * 1000;
export const TICKET_TTL_MS = 10 * 60 * 1000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const stateSchema = z.object({
  /** Quem começou a conectar. */
  uid: z.uuid(),
  nonce: z.string().min(8),
  exp: z.number(),
  /** Site para onde o retorno volta (já conferido contra o CORS na hora de começar). */
  origin: z.string(),
  /** Caminho do site para onde a pessoa volta depois. */
  returnTo: z.string(),
});

export type OAuthState = z.infer<typeof stateSchema>;

export async function createState(
  vault: Vault,
  input: { uid: string; origin: string; returnTo: string },
  now: number,
): Promise<string> {
  const state: OAuthState = {
    ...input,
    nonce: toBase64Url(crypto.getRandomValues(new Uint8Array(16))),
    exp: now + STATE_TTL_MS,
  };
  return vault.sign(toBase64Url(encoder.encode(JSON.stringify(state))));
}

/** O `state` de volta do Google; null quando foi adulterado, venceu ou veio mal formado. */
export async function readState(
  vault: Vault,
  signed: string,
  now: number,
): Promise<OAuthState | null> {
  const payload = await vault.verify(signed);
  if (!payload) return null;
  try {
    const parsed = stateSchema.safeParse(JSON.parse(decoder.decode(fromBase64Url(payload))));
    return parsed.success && parsed.data.exp > now ? parsed.data : null;
  } catch {
    return null;
  }
}

const ticketSchema = z.object({
  refreshToken: z.string().min(1),
  email: z.string().nullable(),
  exp: z.number(),
});

const ticketAad = (uid: string) => `drive-ticket:${uid}`;
const tokenAad = (uid: string) => `drive-refresh-token:${uid}`;

export async function createTicket(
  vault: Vault,
  uid: string,
  input: { refreshToken: string; email: string | null },
  now: number,
): Promise<string> {
  return vault.encrypt(JSON.stringify({ ...input, exp: now + TICKET_TTL_MS }), ticketAad(uid));
}

/** O que o bilhete guarda, se for desta pessoa e estiver na validade; senão null. */
export async function openTicket(
  vault: Vault,
  uid: string,
  ticket: string,
  now: number,
): Promise<{ refreshToken: string; email: string | null } | null> {
  try {
    const parsed = ticketSchema.safeParse(JSON.parse(await vault.decrypt(ticket, ticketAad(uid))));
    if (!parsed.success || parsed.data.exp <= now) return null;
    return { refreshToken: parsed.data.refreshToken, email: parsed.data.email };
  } catch {
    return null;
  }
}

/** O refresh token como fica no banco: criptografado e preso à pessoa dona. */
export function sealRefreshToken(vault: Vault, uid: string, refreshToken: string): Promise<string> {
  return vault.encrypt(refreshToken, tokenAad(uid));
}

export function openRefreshToken(vault: Vault, uid: string, sealed: string): Promise<string> {
  return vault.decrypt(sealed, tokenAad(uid));
}

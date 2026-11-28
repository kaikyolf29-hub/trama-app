import type { AuthRequest } from '@cloudflare/workers-oauth-provider';
import type { McpScope } from '@trama/core';
import { fromBase64Url, toBase64Url, type Vault } from './vault';

/** O bilhete vale 10 minutos, o tempo de a pessoa ler e decidir. */
export const TICKET_TTL_MS = 10 * 60 * 1000;

/**
 * O que o bilhete leva do `/authorize` à tela do site e de volta: o pedido do cliente já validado
 * pela biblioteca e o que a tela mostra. Vai assinado (HMAC), então o site não consegue trocar o
 * cliente nem o endereço de retorno; não é segredo (o desafio PKCE e o `state` já passam pelo
 * navegador no pedido original).
 */
export interface Ticket {
  v: 1;
  /** Quando deixa de valer, em milissegundos. */
  exp: number;
  request: AuthRequest;
  clientName: string;
  clientDomain: string | null;
  redirectHost: string;
  redirectIsLoopback: boolean;
  /** As permissões pedidas (a pessoa pode tirar a escrita, nunca pôr o que não foi pedido). */
  scopes: McpScope[];
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function sealTicket(
  vault: Vault,
  ticket: Omit<Ticket, 'v' | 'exp'>,
  now: Date,
): Promise<string> {
  const full: Ticket = { v: 1, exp: now.getTime() + TICKET_TTL_MS, ...ticket };
  return vault.sign(toBase64Url(encoder.encode(JSON.stringify(full))));
}

/** O bilhete, se a assinatura bate e ainda não venceu; senão `null`. */
export async function openTicket(vault: Vault, signed: string, now: Date): Promise<Ticket | null> {
  const payload = await vault.verify(signed);
  if (!payload) return null;
  try {
    const ticket = JSON.parse(decoder.decode(fromBase64Url(payload))) as Ticket;
    if (ticket.v !== 1 || typeof ticket.exp !== 'number' || ticket.exp < now.getTime()) return null;
    return ticket;
  } catch {
    return null;
  }
}

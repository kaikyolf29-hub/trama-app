/**
 * Criptografia do conector, com a Web Crypto do Worker.
 *
 * Uma chave mestra só (`MCP_ENCRYPTION_KEY`, 32 bytes em base64, segredo do Worker) gera, por
 * HKDF, uma subchave para cifrar (AES-GCM) e outra para assinar (HMAC-SHA-256). A chave é só do
 * conector: quem abre este Worker não ganha a `TOKEN_ENCRYPTION_KEY` da API (chaves de IA e Drive).
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Erro de chave mal configurada, texto cifrado adulterado ou preso a outra pessoa. */
export class CryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CryptoError';
  }
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new CryptoError('base64 inválido');
  const padded = text.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  try {
    return fromBase64Url(text.trim().replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, ''));
  } catch {
    throw new CryptoError('A MCP_ENCRYPTION_KEY não é um base64 válido.');
  }
}

export interface Vault {
  /** Cifra `plain`; `aad` (dado associado) é conferido na hora de decifrar. */
  encrypt(plain: string, aad: string): Promise<string>;
  /** Decifra; adulterado, ou com outro `aad`, vira CryptoError. */
  decrypt(cipher: string, aad: string): Promise<string>;
  /** Assina um texto; devolve `texto.assinatura`. */
  sign(payload: string): Promise<string>;
  /** Devolve o texto assinado, ou null se a assinatura não bate. */
  verify(signed: string): Promise<string | null>;
}

const VERSION = 'v1';

/** Cria o cifrador a partir da chave mestra (base64, 32 bytes: `openssl rand -base64 32`). */
export async function createVault(masterKeyBase64: string): Promise<Vault> {
  const master = fromBase64(masterKeyBase64);
  if (master.length !== 32) {
    throw new CryptoError('A MCP_ENCRYPTION_KEY precisa ter 32 bytes (openssl rand -base64 32).');
  }
  const hkdf = await crypto.subtle.importKey('raw', master, 'HKDF', false, ['deriveKey']);
  type DeriveKey = SubtleCrypto['deriveKey'];
  const derive = (
    info: string,
    algorithm: Parameters<DeriveKey>[2],
    usages: Parameters<DeriveKey>[4],
  ) =>
    crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: encoder.encode(info) },
      hkdf,
      algorithm,
      false,
      usages,
    );
  const [aesKey, hmacKey] = await Promise.all([
    derive('trama:mcp:aes-gcm', { name: 'AES-GCM', length: 256 }, ['encrypt', 'decrypt']),
    derive('trama:mcp:hmac', { name: 'HMAC', hash: 'SHA-256', length: 256 }, ['sign', 'verify']),
  ]);

  return {
    async encrypt(plain, aad) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const data = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: encoder.encode(aad) },
        aesKey,
        encoder.encode(plain),
      );
      return `${VERSION}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(data))}`;
    },

    async decrypt(cipher, aad) {
      const [version, iv, data, extra] = cipher.split('.');
      if (version !== VERSION || !iv || !data || extra !== undefined) {
        throw new CryptoError('texto cifrado em formato desconhecido');
      }
      try {
        const plain = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: fromBase64Url(iv), additionalData: encoder.encode(aad) },
          aesKey,
          fromBase64Url(data),
        );
        return decoder.decode(plain);
      } catch {
        throw new CryptoError('não deu para decifrar (chave errada ou texto de outra pessoa)');
      }
    },

    async sign(payload) {
      const signature = await crypto.subtle.sign('HMAC', hmacKey, encoder.encode(payload));
      return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
    },

    async verify(signed) {
      const cut = signed.lastIndexOf('.');
      if (cut < 1) return null;
      const payload = signed.slice(0, cut);
      try {
        const ok = await crypto.subtle.verify(
          'HMAC',
          hmacKey,
          fromBase64Url(signed.slice(cut + 1)),
          encoder.encode(payload),
        );
        return ok ? payload : null;
      } catch {
        return null;
      }
    },
  };
}

/** O dado associado do refresh token: preso à pessoa e ao conector, não vale em outra concessão. */
export function refreshTokenAad(userId: string): string {
  return `mcp-refresh:${userId}`;
}

const vaults = new Map<string, Promise<Vault>>();

/** O cifrador da chave do ambiente (um por chave, guardado); `null` quando falta a chave. */
export function vaultFor(key: string | undefined): Promise<Vault> | null {
  if (!key) return null;
  let vault = vaults.get(key);
  if (!vault) {
    vault = createVault(key);
    vaults.set(key, vault);
  }
  return vault;
}

import { describe, expect, it } from 'vitest';
import { appBase, isAllowedOrigin } from './origin';
import { openTicket, sealTicket, TICKET_TTL_MS, type Ticket } from './ticket';
import { CryptoError, createVault, refreshTokenAad } from './vault';

const keyA = btoa(String.fromCharCode(...new Uint8Array(32).fill(1)));
const keyB = btoa(String.fromCharCode(...new Uint8Array(32).fill(2)));

describe('cifra do refresh token', () => {
  it('cifra e decifra, e o texto cifrado não mostra o token', async () => {
    const vault = await createVault(keyA);
    const sealed = await vault.encrypt('refresh-secreto-123', refreshTokenAad('ana'));
    expect(sealed).toMatch(/^v1\.[\w-]+\.[\w-]+$/);
    expect(sealed).not.toContain('refresh-secreto');
    expect(await vault.decrypt(sealed, refreshTokenAad('ana'))).toBe('refresh-secreto-123');
  });

  it('cada cifra é diferente (IV novo), mesmo para o mesmo texto', async () => {
    const vault = await createVault(keyA);
    const a = await vault.encrypt('x', 'aad');
    const b = await vault.encrypt('x', 'aad');
    expect(a).not.toBe(b);
  });

  it('o token fica preso à pessoa: com o dado associado de outra, não abre', async () => {
    const vault = await createVault(keyA);
    const sealed = await vault.encrypt('refresh', refreshTokenAad('ana'));
    await expect(vault.decrypt(sealed, refreshTokenAad('beto'))).rejects.toBeInstanceOf(
      CryptoError,
    );
  });

  it('com outra chave mestra, ou com o texto adulterado, não abre', async () => {
    const sealed = await (await createVault(keyA)).encrypt('refresh', 'aad');
    await expect((await createVault(keyB)).decrypt(sealed, 'aad')).rejects.toBeInstanceOf(
      CryptoError,
    );
    const vault = await createVault(keyA);
    const [version, iv, data] = sealed.split('.');
    const flipped = `${version}.${iv}.${data!.slice(0, -2)}AA`;
    await expect(vault.decrypt(flipped, 'aad')).rejects.toBeInstanceOf(CryptoError);
    await expect(vault.decrypt('lixo', 'aad')).rejects.toBeInstanceOf(CryptoError);
    await expect(vault.decrypt(`v2.${iv}.${data}`, 'aad')).rejects.toBeInstanceOf(CryptoError);
  });

  it('exige uma chave de 32 bytes em base64', async () => {
    await expect(createVault(btoa('curta'))).rejects.toThrow(/32 bytes/);
    await expect(createVault('não é base64!!')).rejects.toBeInstanceOf(CryptoError);
  });

  it('assina e confere, e recusa texto mexido ou assinado com outra chave', async () => {
    const vault = await createVault(keyA);
    const signed = await vault.sign('conteudo');
    expect(await vault.verify(signed)).toBe('conteudo');
    expect(await vault.verify(signed.replace('conteudo', 'outro'))).toBeNull();
    expect(await (await createVault(keyB)).verify(signed)).toBeNull();
    expect(await vault.verify('sem-ponto')).toBeNull();
  });
});

describe('bilhete do consentimento', () => {
  const body: Omit<Ticket, 'v' | 'exp'> = {
    request: {
      responseType: 'code',
      clientId: 'c1',
      redirectUri: 'https://claude.test/callback',
      scope: ['trama:read'],
      state: 's',
      codeChallenge: 'x'.repeat(43),
      codeChallengeMethod: 'S256',
    },
    clientName: 'Claude',
    clientDomain: null,
    redirectHost: 'claude.test',
    redirectIsLoopback: false,
    scopes: ['trama:read'],
  };

  it('vale por 10 minutos e devolve o mesmo pedido', async () => {
    const vault = await createVault(keyA);
    const now = new Date('2026-11-28T15:00:00Z');
    const sealed = await sealTicket(vault, body, now);
    const opened = await openTicket(vault, sealed, new Date(now.getTime() + TICKET_TTL_MS - 1000));
    expect(opened?.request).toEqual(body.request);
    expect(opened?.clientName).toBe('Claude');
    expect(
      await openTicket(vault, sealed, new Date(now.getTime() + TICKET_TTL_MS + 1000)),
    ).toBeNull();
  });

  it('não abre se foi mexido ou veio de outra chave', async () => {
    const vault = await createVault(keyA);
    const now = new Date();
    const sealed = await sealTicket(vault, body, now);
    const [payload, signature] = sealed.split('.');
    const forgedBody = btoa(JSON.stringify({ ...body, v: 1, exp: now.getTime() + 1e9 }))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '');
    expect(await openTicket(vault, `${forgedBody}.${signature}`, now)).toBeNull();
    expect(await openTicket(await createVault(keyB), `${payload}.${signature}`, now)).toBeNull();
    expect(await openTicket(vault, '', now)).toBeNull();
  });
});

describe('origem do site', () => {
  const env = { APP_URL: 'https://trama.abc.workers.dev/', WORKERS_SUBDOMAIN: 'abc' };

  it('libera o site, os previews dos PRs e o pnpm dev', () => {
    expect(isAllowedOrigin('https://trama.abc.workers.dev', env)).toBe(true);
    expect(isAllowedOrigin('https://pr-12-trama.abc.workers.dev', env)).toBe(true);
    expect(isAllowedOrigin('http://localhost:5173', {})).toBe(true);
  });

  it('recusa o resto', () => {
    expect(isAllowedOrigin('https://atacante.test', env)).toBe(false);
    expect(isAllowedOrigin('https://trama.abc.workers.dev.atacante.test', env)).toBe(false);
    expect(isAllowedOrigin('https://trama.outra.workers.dev', env)).toBe(false);
    expect(isAllowedOrigin('http://localhost:5174', {})).toBe(false);
  });

  it('o site, sem barra no fim', () => {
    expect(appBase(env)).toBe('https://trama.abc.workers.dev');
    expect(appBase({})).toBe('http://localhost:5173');
  });
});

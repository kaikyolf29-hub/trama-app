import { describe, expect, it } from 'vitest';
import { createState, createTicket, openTicket, readState, STATE_TTL_MS } from './tickets';
import { createVault, CryptoError } from './vault';

const KEY = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i + 1)));
const OTHER_KEY = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => 200 - i)));
const ANA = '11111111-1111-4111-8111-111111111111';
const BIA = '22222222-2222-4222-8222-222222222222';

describe('criptografia do token', () => {
  it('cifra e decifra, e o texto cifrado não mostra o token', async () => {
    const vault = await createVault(KEY);
    const sealed = await vault.encrypt('1//refresh-token-secreto', `dono:${ANA}`);
    expect(sealed).toMatch(/^v1\.[\w-]+\.[\w-]+$/);
    expect(sealed).not.toContain('refresh-token');
    expect(await vault.decrypt(sealed, `dono:${ANA}`)).toBe('1//refresh-token-secreto');
  });

  it('cada cifra usa um vetor novo (o mesmo texto não sai igual duas vezes)', async () => {
    const vault = await createVault(KEY);
    expect(await vault.encrypt('x', 'a')).not.toBe(await vault.encrypt('x', 'a'));
  });

  it('recusa texto adulterado, chave errada e texto de outra pessoa', async () => {
    const vault = await createVault(KEY);
    const sealed = await vault.encrypt('segredo', `dono:${ANA}`);
    const tampered = `${sealed.slice(0, -2)}${sealed.endsWith('AA') ? 'BB' : 'AA'}`;
    await expect(vault.decrypt(tampered, `dono:${ANA}`)).rejects.toBeInstanceOf(CryptoError);
    await expect((await createVault(OTHER_KEY)).decrypt(sealed, `dono:${ANA}`)).rejects.toThrow(
      CryptoError,
    );
    // Linha copiada para a conta de outra pessoa não decifra.
    await expect(vault.decrypt(sealed, `dono:${BIA}`)).rejects.toThrow(CryptoError);
    await expect(vault.decrypt('lixo', 'a')).rejects.toThrow(CryptoError);
  });

  it('exige uma chave de 32 bytes em base64', async () => {
    await expect(createVault(btoa('curta'))).rejects.toThrow(/32 bytes/);
    await expect(createVault('!!não é base64!!')).rejects.toThrow(CryptoError);
  });

  it('a assinatura vale só para o texto e a chave certos', async () => {
    const vault = await createVault(KEY);
    const signed = await vault.sign('abc');
    expect(await vault.verify(signed)).toBe('abc');
    expect(await vault.verify(signed.replace('abc', 'abd'))).toBeNull();
    expect(await (await createVault(OTHER_KEY)).verify(signed)).toBeNull();
    expect(await vault.verify('sem-ponto')).toBeNull();
  });

  it('assinar e cifrar usam subchaves diferentes (uma assinatura não decifra nada)', async () => {
    const vault = await createVault(KEY);
    const signed = await vault.sign('abc');
    await expect(vault.decrypt(`v1.${signed}`, 'a')).rejects.toThrow(CryptoError);
  });
});

describe('state do OAuth e bilhete de retorno', () => {
  const input = { uid: ANA, origin: 'https://trama.example', returnTo: '/' };

  it('o state de volta traz quem começou, e vence em 10 minutos', async () => {
    const vault = await createVault(KEY);
    const state = await createState(vault, input, 1_000);
    expect(await readState(vault, state, 2_000)).toMatchObject(input);
    expect(await readState(vault, state, 1_000 + STATE_TTL_MS)).toBeNull();
  });

  it('recusa state adulterado ou de outra chave', async () => {
    const vault = await createVault(KEY);
    const state = await createState(vault, input, 1_000);
    const [payload, signature] = state.split('.');
    const forged = btoa(JSON.stringify({ ...input, uid: BIA, nonce: 'x'.repeat(10), exp: 9e12 }))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '');
    expect(await readState(vault, `${forged}.${signature}`, 2_000)).toBeNull();
    expect(await readState(vault, `${payload}.AAAA`, 2_000)).toBeNull();
    expect(await readState(await createVault(OTHER_KEY), state, 2_000)).toBeNull();
    expect(await readState(vault, '', 2_000)).toBeNull();
  });

  it('o bilhete só abre para a pessoa dona, dentro da validade', async () => {
    const vault = await createVault(KEY);
    const ticket = await createTicket(vault, ANA, { refreshToken: 'rt', email: 'a@b.c' }, 1_000);
    expect(await openTicket(vault, ANA, ticket, 2_000)).toEqual({
      refreshToken: 'rt',
      email: 'a@b.c',
    });
    expect(await openTicket(vault, BIA, ticket, 2_000)).toBeNull();
    expect(await openTicket(vault, ANA, ticket, 1_000 + STATE_TTL_MS)).toBeNull();
    expect(await openTicket(vault, ANA, 'qualquer coisa', 2_000)).toBeNull();
  });
});

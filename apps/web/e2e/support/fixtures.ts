import { test as base, expect } from '@playwright/test';
import { FakeApi } from './api';
import { blockSupabase, signedInAs, testUser, type TestUser } from './auth';

interface Fixtures {
  /** A API de projetos em memória, já ligada à página. */
  api: FakeApi;
  /** O bloqueio do Supabase (automático). */
  blocked: void;
  /** Deixa a pessoa logada (sessão falsa no localStorage). Chame antes do primeiro `goto`. */
  signIn: (user?: TestUser) => Promise<void>;
}

/**
 * O `test` do Trama: toda página nasce com o Supabase bloqueado e a API simulada. Quem quiser
 * o login simulado usa `mockSupabaseAuth(page)` (veja auth.e2e.ts); quem quiser a pessoa já
 * logada usa `signIn()`.
 *
 * Para acrescentar o modo aula e o Drive depois: simule as rotas novas dentro do `FakeApi`
 * (ou numa classe irmã ligada com `attach(page)`) e exponha aqui como mais uma fixture.
 */
export const test = base.extend<Fixtures>({
  // Erro de JavaScript solto na página (exceção não tratada) reprova o teste.
  page: async ({ page }, provide) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await provide(page);
    expect(errors, 'erros de JavaScript na página').toEqual([]);
  },
  // Automático: nenhum teste chega ao Supabase de verdade, nem sem usar `api`.
  blocked: [
    async ({ page }, provide) => {
      await blockSupabase(page);
      await provide();
    },
    { auto: true },
  ],
  api: async ({ page, blocked: _blocked }, provide) => {
    const api = new FakeApi();
    await api.attach(page);
    await provide(api);
  },
  signIn: async ({ page, api: _api }, provide) => {
    await provide((user = testUser) => signedInAs(page, user));
  },
});

export { expect };

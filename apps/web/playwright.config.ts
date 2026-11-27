import { defineConfig, devices } from '@playwright/test';

/**
 * Testes de ponta a ponta do site (etapa 1.9). Rodam contra o site construído
 * (`vite build` + `vite preview`), com a API e o login simulados no navegador
 * (veja e2e/support): nada toca o Supabase de verdade.
 *
 * - `E2E_PORT`: porta do `vite preview` (padrão 4173).
 * - `E2E_SKIP_BUILD=1`: reaproveita o `dist/` que já existe.
 * - `pnpm e2e`: fluxos e desempenho; `pnpm e2e:perf`: só o teste de 500 blocos.
 */
const port = Number(process.env.E2E_PORT ?? 4173);
const baseURL = `http://127.0.0.1:${port}`;
const build = process.env.E2E_SKIP_BUILD ? '' : 'pnpm exec vite build && ';
const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } };

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  outputDir: 'test-results',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL,
    trace: 'off',
    screenshot: 'only-on-failure',
    deviceScaleFactor: 1,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  },
  webServer: {
    command: `${build}pnpm exec vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    timeout: 180_000,
    reuseExistingServer: false,
  },
  projects: [
    { name: 'fluxos', testIgnore: '**/perf.e2e.ts', use: desktop },
    {
      // Desempenho: roda depois dos fluxos e sozinho, para não disputar CPU com eles
      // (os quadros por segundo dependem da máquina estar livre).
      name: 'desempenho',
      testMatch: '**/perf.e2e.ts',
      dependencies: ['fluxos'],
      timeout: 120_000,
      retries: 0,
      use: desktop,
    },
  ],
});

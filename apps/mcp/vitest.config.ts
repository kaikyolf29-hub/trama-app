import { defineConfig } from 'vitest/config';

// A biblioteca de OAuth importa `cloudflare:workers`, que só existe no workerd. Nos testes (Node)
// esse módulo vira uma imitação mínima, e a própria biblioteca passa pelo Vite para o apelido valer.
export default defineConfig({
  resolve: {
    alias: {
      'cloudflare:workers': decodeURIComponent(
        new URL('./src/test/cloudflare-workers.ts', import.meta.url).pathname,
      ),
    },
  },
  test: {
    server: { deps: { inline: ['@cloudflare/workers-oauth-provider'] } },
  },
});

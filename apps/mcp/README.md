# apps/mcp — Conector MCP

Feito pelo Claude Code, revisado pelo Codex no fim · Etapa 3.4

Worker `trama-mcp` com `@cloudflare/workers-oauth-provider` e o SDK oficial
`@modelcontextprotocol/server`. Outras IAs (Claude, ChatGPT, Codex) leem e criam fluxos, roteiros e
estudos com o login e a permissão da pessoa. As nove ferramentas (`listar_projetos`, `ler_fluxo`,
`criar_fluxo`, `adicionar_blocos`, `marcar_concluido`, `organizar_texto`, `criar_roteiro`,
`registrar_estudo`, `buscar_agenda`) estão em `docs/PLAN.md`, seção "Conector MCP do Trama".
Nenhuma apaga nada.

- `src/worker.ts`: a biblioteca de OAuth na frente; `/mcp` é o servidor, o resto são as rotas do site.
- `src/site.ts`: `/authorize`, `/connect/info`, `/connect/decision`, `/connectors`.
- `src/exchange.ts`: renova a sessão do Supabase a cada troca de token (refresh token cifrado).
- `src/endpoint.ts`: barra a escrita sem permissão (`insufficient_scope`) antes do SDK.
- `src/tools.ts`: as ferramentas. Toda a lógica de montar blocos, setas, roteiros e aulas está em
  `packages/core` (`mcp.ts` e `mcp-tools.ts`), então o quadro sempre abre o que o MCP cria.
- `src/trama-api.ts`: o cliente da API do Trama (service binding `TRAMA_API`).

Testes: `pnpm --filter @trama/mcp test` (em Node, com a biblioteca de OAuth de verdade, KV em
memória e um cliente MCP do SDK). Como publicar e conectar: `docs/DEPLOY.md`, "Conector MCP".

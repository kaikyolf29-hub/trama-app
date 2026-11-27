# apps/mcp — Conector MCP

Feito pelo Claude Code, revisado pelo Codex no fim · Entra na Fase 3

Worker separado com `@cloudflare/workers-oauth-provider`. Outras IAs leem e criam fluxos,
roteiros e estudos com o login e a permissão da pessoa. As ferramentas (`listar_projetos`,
`ler_fluxo`, `criar_fluxo`…) estão em `docs/PLAN.md`, seção "Conector MCP do Trama".

Valida tudo com `@trama/core`, para nunca criar um fluxo que o quadro não sabe abrir. Ainda vazio.

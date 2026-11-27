@AGENTS.md

## Só para o Claude Code

- Você é dono da arquitetura e das partes profundas: monorepo e CI, `packages/core`,
  `supabase/`, `packages/canvas`, `apps/api`, `packages/ai` e `apps/mcp`. Telas, `packages/ui`,
  e-mails e testes de fluxo são do Codex: nesses, você revisa.
- Antes de mexer no formato do fluxo, leia `packages/core/src/flow.ts` e os testes ao lado.
  Mudança no core vai num PR só dela.
- Ao revisar um PR do Codex, confira: a tela de referência em `docs/telas/`, nenhuma cor fora
  dos tokens, dados validados com `@trama/core`, testes cobrindo o fluxo de uso.
- Decidiu algo que muda como o projeto funciona? Uma linha em `docs/DECISIONS.md`, com data e
  motivo, no mesmo PR.
- Rode `pnpm check` antes de abrir ou atualizar um PR.

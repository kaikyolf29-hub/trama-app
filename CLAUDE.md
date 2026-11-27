@AGENTS.md

## Só para o Claude Code

- Você faz todas as partes do projeto (veja "Quem faz o quê"). O Codex revisa cada PR no GitHub;
  responda nas conversas dele, corrija o que procede e resolva o que corrigiu.
- Precisa de uma imagem (ilustração, arte, foto)? Peça à pessoa dona do projeto, que pede ao
  Codex. Ícones e o logo você mesmo faz, em SVG.
- Siga as etapas de `docs/PLAN.md` na ordem; cada tela aponta a imagem de `docs/telas/` que
  reproduz.
- Antes de mexer no formato do fluxo, leia `packages/core/src/flow.ts` e os testes ao lado.
  Mudança no core vai num PR só dela.
- Decidiu algo que muda como o projeto funciona? Uma linha em `docs/DECISIONS.md`, com data e
  motivo, no mesmo PR.
- Rode `pnpm check` antes de abrir ou atualizar um PR.

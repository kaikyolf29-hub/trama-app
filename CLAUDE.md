@AGENTS.md

## Só para o Claude Code

- Comece por `docs/ANDAMENTO.md`: o que está no ar, os PRs abertos na ordem de merge, o que
  falta e como o trabalho vinha sendo feito.
- Você faz todas as partes do projeto e decide o que é técnico. Faça o merge quando o CI estiver
  verde (PRs empilhados em ordem, com commit de merge). O Codex revisa no fim, no GitHub.
- Travou em algo que só a pessoa dona do projeto pode fazer (conta, chave, painel) ou precisa de
  uma imagem? Escreva um pedido pronto para ela mandar ao Codex, que controla o computador dela.
  Nunca peça segredo pelo chat.
- Só planos grátis (veja "Quem faz o quê").
- Siga as etapas de `docs/PLAN.md` na ordem; cada tela aponta a imagem de `docs/telas/` que
  reproduz.
- Antes de mexer no formato do fluxo, leia `packages/core/src/flow.ts` e os testes ao lado.
  Mudança no core vai num PR só dela.
- Decidiu algo que muda como o projeto funciona? Uma linha em `docs/DECISIONS.md`, com data e
  motivo, no mesmo PR.
- Rode `pnpm check` antes de abrir ou atualizar um PR.

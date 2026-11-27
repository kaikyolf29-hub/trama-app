# packages/ui — Tokens e componentes

Dono: **Codex** · Revisor: Claude Code · Entra na Fase 0

Primeiro arquivo a nascer aqui: `tokens.ts`, com os tokens de `docs/PLAN.md` ("Tokens de
design"), antes de qualquer tela. Toda cor do app sai daqui.

`@trama/core` guarda só os **nomes** dos tokens que vão para os dados do fluxo (ex.: notas
`yellow`, `blue`, `green`, `pink`; texto `strong`, `normal`, `muted`; fontes `sans`, `serif`,
`mono`, `hand`). Este pacote dá o valor de cada nome. Ainda vazio.

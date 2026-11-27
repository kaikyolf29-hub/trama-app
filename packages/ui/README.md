# packages/ui — Tokens e componentes

Feito pelo Claude Code, revisado pelo Codex no fim.

- `tokens.ts`: o único arquivo com cores escritas, mais fontes, raios, sombras e movimento. O
  `@trama/core` guarda só os **nomes** (notas `yellow`/`blue`/`green`/`pink`, texto
  `strong`/`normal`/`muted`, fontes `sans`/`serif`/`mono`/`hand`); este pacote dá o valor.
- `src/tailwind-theme.ts`: o tema do Tailwind montado dos tokens, sem a paleta padrão.
- `src/`: `Button`, `TextField`, `PasswordField`, `Alert`, `Logo`, `LogoMark` e `Spinner`.

Regras e tabela completa dos tokens em `docs/DESIGN.md`. Vitrine viva: `pnpm dev` →
http://localhost:5173/design.

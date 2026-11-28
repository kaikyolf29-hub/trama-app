# apps/api — Worker da API

Feito pelo Claude Code, revisado pelo Codex no fim · Entra na Fase 0 (login e deploy)

A única porta para o banco, o Drive, os e-mails e as IAs. Hono em Cloudflare Workers:

- projetos (salvar no Supabase 2 s depois da última mudança) e cópia no Google Drive;
- chamadas de IA com a chave da própria pessoa, lida só aqui;
- e-mails pelo Resend e o resumo semanal (Cron Trigger).

Usa a lógica de `@trama/core`; nunca duplica regras de lá.

Rotas: `GET /health`, `/projects` (etapa 1.5) e `GET` e `PATCH /account/profile` (etapa 2.5: nome, fuso e preferências de e-mail, com o token da pessoa e a RLS). Roda com `pnpm dev` em http://localhost:8787 e vai para o ar
com o site (`docs/DEPLOY.md`).

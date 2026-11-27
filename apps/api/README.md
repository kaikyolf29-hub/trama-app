# apps/api — Worker da API

Dono: **Claude Code** · Revisor: Codex · Entra na Fase 0 (login e deploy)

A única porta para o banco, o Drive, os e-mails e as IAs. Hono em Cloudflare Workers:

- projetos (salvar no Supabase 2 s depois da última mudança) e cópia no Google Drive;
- chamadas de IA com a chave da própria pessoa, lida só aqui;
- e-mails pelo Resend e o resumo semanal (Cron Trigger).

Usa a lógica de `@trama/core`; nunca duplica regras de lá. Ainda vazio.

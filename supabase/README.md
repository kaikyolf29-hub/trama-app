# supabase/ — Banco, login e arquivos

Dono: **Claude Code** · Revisor: Codex · Entra na Fase 0 (login)

Migrations em `migrations/` e políticas RLS. Toda tabela tem RLS: cada pessoa só lê e escreve
as próprias linhas. As chaves de IA (`ai_keys`) são lidas apenas pelo Worker da API.

Tabelas previstas (`docs/PLAN.md`, "Tabelas principais"): `profiles`, `projects`,
`project_versions`, `events`, `lessons`, `ai_keys`, `ai_settings`, `mcp_clients`.

Migration aplicada não se edita: crie outra. Ainda vazio.

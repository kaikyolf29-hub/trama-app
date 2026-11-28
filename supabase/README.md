# supabase/ — Banco, login e arquivos

Projeto **trama** no Supabase, plano grátis, região São Paulo (`sa-east-1`).

| Pasta ou arquivo | O que tem                                                                 |
| ---------------- | ------------------------------------------------------------------------- |
| `migrations/`    | Mudanças do banco, em ordem. Migration aplicada não se edita: crie outra. |
| `tests/`         | Testes das regras de acesso (RLS), que rodam e desfazem tudo no fim.      |
| `templates/`     | Modelos de e-mail do login, gerados de `packages/emails`.                 |
| `config.toml`    | Configuração do login como código (senha, confirmação, e-mails, SMTP).    |

## Tabelas

| Tabela      | Guarda                                                         | Quem lê e edita                                |
| ----------- | -------------------------------------------------------------- | ---------------------------------------------- |
| `profiles`  | Nome, fuso (padrão America/Sao_Paulo), preferências de e-mail  | Só a própria pessoa; nasce no cadastro         |
| `events`    | O que aconteceu e quando (Agenda); automáticos por gatilho     | Lê, anota à mão e apaga anotações              |
| `lessons`   | Aulas dos cadernos: status, data estudada, data de revisão     | Só a própria pessoa, só em caderno             |
| `email_log` | Resumos e lembretes já enviados (pessoa, tipo, dia; sem texto) | Ninguém pelo app; só funções da `service_role` |

Toda tabela tem RLS. As funções internas (gatilhos) ficam no esquema `private`, fora da API.

## Como aplicar e testar

- Migrations novas: aplique no projeto (CLI `supabase db push` ou o conector do Supabase) e
  guarde o arquivo aqui com a versão que o Supabase registrou.
- Testes: cole `tests/profiles_rls.sql` no SQL Editor do projeto. Sem erro, passou; nenhum dado
  fica no banco.
- Depois de mudar o banco, rode o "Security Advisor" do painel (ou `get_advisors`).

Tabelas que chegam nas próximas etapas: `projects`, `project_versions`, `events`, `lessons`,
`ai_keys`, `ai_settings`, `mcp_clients` (docs/PLAN.md, "Tabelas principais").

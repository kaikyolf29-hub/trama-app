# packages/emails — Modelos de e-mail

Modelos em React Email, no visual escuro do app, com o logo do Trama no topo. As cores vêm de
`@trama/ui/tokens`.

| E-mail               | Quem envia                                      | Onde                                                                                                  |
| -------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Recuperação de senha | Supabase Auth, pelo SMTP do Resend              | `RecoveryEmail` → `supabase/templates/recovery.html`                                                  |
| Troca de e-mail      | Supabase Auth, pelo SMTP do Resend (aos dois)   | `EmailChangeEmail` → `supabase/templates/email_change.html`                                           |
| Boas-vindas          | Worker da API, pelo Resend, depois do cadastro  | `renderWelcomeEmail({ name, siteUrl })`                                                               |
| Aviso do Drive       | Worker da API, pelo Resend, na 3ª falha seguida | `renderDriveNoticeEmail({ name, siteUrl, reason })`                                                   |
| Resumo semanal       | Tarefa agendada da API, segunda às 8h           | `renderWeeklySummaryEmail({ ..., unsubscribeUrl, rangeLabel, studied, toReview, completed, intro? })` |
| Lembrete de revisão  | Tarefa agendada da API, 8h do dia da revisão    | `renderReviewReminderEmail({ ..., unsubscribeUrl, lessons })`                                         |

- **Logo:** PNG de 80×80 (2× de 40 px) em `apps/web/public/email/logo.png`, servido pelo site
  em `<APP_URL>/email/logo.png`. É PNG porque vários programas de e-mail não mostram SVG, e o
  Gmail bloqueia imagens embutidas no HTML.
- **Modelos do Supabase:** o Supabase Auth só aceita HTML pronto, com as variáveis dele
  (`{{ .SiteURL }}`, `{{ .TokenHash }}`, `{{ .Data.name }}`). O link leva a `/nova-senha?token_hash=…` (e o de troca de e-mail, a `/confirmar-email?token_hash=…`), que a tela confere. Mudou um modelo?
  Gere de novo:

  ```bash
  pnpm --filter @trama/emails templates:supabase
  ```

  Um teste falha se o arquivo em `supabase/templates/` ficar desatualizado.

- Todo e-mail traz o motivo do envio no rodapé. O resumo e o lembrete têm também o link de
  descadastro (`unsubscribeUrl`), que desliga só aquele e-mail sem precisar de login.

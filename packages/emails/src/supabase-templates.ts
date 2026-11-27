import { render } from '@react-email/render';
import { createElement } from 'react';
import { RecoveryEmail } from './RecoveryEmail';

/**
 * Modelos que o Supabase Auth envia (pelo SMTP do Resend). O Supabase troca as
 * variáveis `{{ .X }}` na hora do envio (Go templates), então elas entram aqui como
 * texto. Os arquivos ficam em supabase/templates/ e são referenciados no config.toml.
 *
 * Sem quebra de linha automática: ela poderia cair no meio de um `{{ ... }}`.
 * Gere de novo com `pnpm --filter @trama/emails templates:supabase` sempre que um
 * modelo mudar; um teste avisa quando o arquivo ficou desatualizado.
 */
export const SUPABASE_TEMPLATES = {
  'recovery.html': () =>
    render(
      createElement(RecoveryEmail, {
        // O link leva à tela /nova-senha com o token_hash, que a tela confere
        // (verifyOtp). Funciona mesmo aberto em outro aparelho, e robôs que abrem
        // links de e-mail não gastam o token, porque eles não rodam o JavaScript da tela.
        resetUrl: '{{ .SiteURL }}/nova-senha?token_hash={{ .TokenHash }}&type=recovery',
        siteUrl: '{{ .SiteURL }}',
        greeting: '{{ if .Data.name }}Olá, {{ .Data.name }}.{{ else }}Olá.{{ end }}',
      }),
    ),
} as const;

export type SupabaseTemplateName = keyof typeof SUPABASE_TEMPLATES;

/** Assuntos, para o config.toml e o painel do Supabase. */
export const SUPABASE_SUBJECTS: Record<SupabaseTemplateName, string> = {
  'recovery.html': 'Crie uma senha nova no Trama',
};

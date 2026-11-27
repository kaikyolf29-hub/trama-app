import { readFile } from 'node:fs/promises';
import { colors } from '@trama/ui/tokens';
import { describe, expect, it } from 'vitest';
import { renderRecoveryEmail, renderWelcomeEmail } from './index';
import { SUPABASE_TEMPLATES } from './supabase-templates';

const siteUrl = 'https://trama.example';

describe('e-mail de boas-vindas', () => {
  it('chama a pessoa pelo primeiro nome e leva ao primeiro fluxo', async () => {
    const email = await renderWelcomeEmail({ name: 'Ana Souza', siteUrl });
    expect(email.subject).toBe('Boas-vindas ao Trama');
    expect(email.html).toContain('Boas-vindas ao Trama, <!-- -->Ana');
    expect(email.html).toContain('href="https://trama.example"');
    expect(email.text).toContain('Criar meu primeiro fluxo');
  });

  it('mostra o logo do Trama no topo', async () => {
    const { html } = await renderWelcomeEmail({ name: 'Ana', siteUrl: `${siteUrl}/` });
    expect(html).toContain('src="https://trama.example/email/logo.png"');
    expect(html).toContain('alt="Trama"');
  });

  it('usa as cores dos tokens', async () => {
    const { html } = await renderWelcomeEmail({ name: 'Ana', siteUrl });
    expect(html.toLowerCase()).toContain(colors.canvas.toLowerCase());
    expect(html.toLowerCase()).toContain(colors.surface.toLowerCase());
  });
});

describe('e-mail de recuperação de senha', () => {
  it('leva ao link no botão e no endereço de reserva', async () => {
    const resetUrl = 'https://trama.example/nova-senha?token=abc';
    const email = await renderRecoveryEmail({ resetUrl, siteUrl });
    expect(email.subject).toBe('Crie uma senha nova no Trama');
    expect(
      email.html.match(/href="https:\/\/trama\.example\/nova-senha\?token=abc"/g),
    ).toHaveLength(2);
    expect(email.text).toContain(resetUrl);
    expect(email.html).not.toContain('undefined');
  });
});

describe('modelos do Supabase Auth', () => {
  it('mantêm as variáveis do Supabase intactas', async () => {
    const html = await SUPABASE_TEMPLATES['recovery.html']();
    expect(html).toContain('href="{{ .ConfirmationURL }}"');
    expect(html).toContain('src="{{ .SiteURL }}/email/logo.png"');
    expect(html).toContain('{{ if .Data.name }}Olá, {{ .Data.name }}.{{ else }}Olá.{{ end }}');
  });

  it('o arquivo em supabase/templates/ está em dia com o componente', async () => {
    const file = new URL('../../../supabase/templates/recovery.html', import.meta.url);
    const committed = await readFile(file, 'utf8').catch(() => '');
    const fresh = await SUPABASE_TEMPLATES['recovery.html']();
    expect(committed, 'Rode: pnpm --filter @trama/emails templates:supabase').toBe(fresh);
  });
});

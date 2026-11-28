import { readFile } from 'node:fs/promises';
import { colors } from '@trama/ui/tokens';
import { describe, expect, it } from 'vitest';
import {
  renderDriveNoticeEmail,
  renderRecoveryEmail,
  renderReviewReminderEmail,
  renderWeeklySummaryEmail,
  renderWelcomeEmail,
} from './index';
import { SUPABASE_TEMPLATES, type SupabaseTemplateName } from './supabase-templates';

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

describe('Aviso do Drive', () => {
  it('explica que nada se perdeu e leva de volta ao Trama', async () => {
    const email = await renderDriveNoticeEmail({
      name: 'Ana Souza',
      siteUrl,
      reason: 'O Google recusou o acesso.',
    });
    expect(email.subject).toBe('Não deu para copiar seus projetos para o Drive');
    expect(email.html).toContain('Olá, Ana.');
    expect(email.html).toContain('href="https://trama.example"');
    expect(email.text).toContain('nada se perdeu');
    expect(email.text).toContain('O Google recusou o acesso.');
    expect(email.html).toContain('src="https://trama.example/email/logo.png"');
  });

  it('funciona sem nome e sem motivo', async () => {
    const email = await renderDriveNoticeEmail({ siteUrl });
    expect(email.html).not.toContain('undefined');
    expect(email.text).not.toContain('Motivo:');
  });
});

const unsubscribeUrl = 'https://api.trama.example/unsubscribe?t=abc';
const empty = { items: [], more: 0 };

describe('Resumo semanal', () => {
  const props = {
    name: 'Ana Souza',
    siteUrl,
    unsubscribeUrl,
    rangeLabel: '23 a 29 de novembro',
    studied: {
      items: [
        { title: 'Atalhos de corte', detail: 'Premiere Pro · 25 nov' },
        { title: 'Phrasal verbs', detail: 'Inglês · revisão · 26 nov' },
      ],
      more: 3,
    },
    toReview: { items: [{ title: 'Correção de cor', detail: 'Premiere Pro · 30 nov' }], more: 0 },
    completed: {
      items: [{ title: 'Como editar 10x mais rápido', detail: 'Fluxo · 27 nov' }],
      more: 0,
    },
  };

  it('lista o que estudou, o que concluiu e o que revisar, com o link de descadastro', async () => {
    const email = await renderWeeklySummaryEmail(props);
    expect(email.subject).toBe('Seu resumo de estudos da semana');
    expect(email.html).toContain('Olá, Ana.');
    for (const text of [
      '23 a 29 de novembro',
      'Atalhos de corte',
      'Premiere Pro · 25 nov',
      'Como editar 10x mais rápido',
      'Correção de cor',
      'e mais 3 itens, no Trama.',
    ]) {
      expect(email.text).toContain(text);
    }
    expect(email.html).toContain(`href="${unsubscribeUrl}"`);
    expect(email.html).toContain('href="https://trama.example/estudos"');
    expect(email.html).toContain('src="https://trama.example/email/logo.png"');
    expect(email.html).not.toContain('undefined');
  });

  it('um bloco vazio some e o parágrafo da IA aparece quando existe', async () => {
    const plain = await renderWeeklySummaryEmail({ ...props, completed: empty });
    // O texto puro põe os títulos de bloco em maiúsculas.
    expect(plain.text.toLowerCase()).not.toContain('você concluiu');
    expect(plain.text.toLowerCase()).toContain('você estudou');
    const withIntro = await renderWeeklySummaryEmail({
      ...props,
      intro: 'Semana forte de edição.',
    });
    expect(withIntro.text).toContain('Semana forte de edição.');
  });

  it('usa só as cores dos tokens', async () => {
    const { html } = await renderWeeklySummaryEmail(props);
    expect(html.toLowerCase()).toContain(colors.canvas.toLowerCase());
    expect(html.toLowerCase()).toContain(colors.textStrong.toLowerCase());
  });
});

describe('Lembrete de revisão', () => {
  it('conta as aulas no assunto, no singular e no plural', async () => {
    const one = await renderReviewReminderEmail({
      siteUrl,
      unsubscribeUrl,
      lessons: { items: [{ title: 'Correção de cor' }], more: 0 },
    });
    expect(one.subject).toBe('Hoje tem 1 aula para revisar');
    const many = await renderReviewReminderEmail({
      name: 'Ana',
      siteUrl,
      unsubscribeUrl,
      lessons: { items: [{ title: 'A' }, { title: 'B' }], more: 4 },
    });
    expect(many.subject).toBe('Hoje tem 6 aulas para revisar');
    expect(many.text).toContain('e mais 4 itens, no Trama.');
    expect(many.html).toContain(`href="${unsubscribeUrl}"`);
    expect(many.html).toContain('Parar de receber o lembrete de revisão');
    expect(many.html).not.toContain('undefined');
  });
});

describe('modelos do Supabase Auth', () => {
  it('mantêm as variáveis do Supabase intactas', async () => {
    const html = await SUPABASE_TEMPLATES['recovery.html']();
    expect(html).toContain(
      'href="{{ .SiteURL }}/nova-senha?token_hash={{ .TokenHash }}&amp;type=recovery"',
    );
    expect(html).toContain('src="{{ .SiteURL }}/email/logo.png"');
    expect(html).toContain('{{ if .Data.name }}Olá, {{ .Data.name }}.{{ else }}Olá.{{ end }}');
  });

  it('o e-mail de troca de endereço leva ao link, ao logo e aos dois endereços', async () => {
    const html = await SUPABASE_TEMPLATES['email_change.html']();
    expect(html).toContain(
      'href="{{ .SiteURL }}/confirmar-email?token_hash={{ .TokenHash }}&amp;type=email_change"',
    );
    expect(html).toContain('src="{{ .SiteURL }}/email/logo.png"');
    expect(html).toContain('{{ .Email }}');
    expect(html).toContain('{{ .NewEmail }}');
    expect(html).toContain('{{ if .Data.name }}Olá, {{ .Data.name }}.{{ else }}Olá.{{ end }}');
  });

  it.each(Object.keys(SUPABASE_TEMPLATES) as SupabaseTemplateName[])(
    'o arquivo supabase/templates/%s está em dia com o componente',
    async (name) => {
      const file = new URL(`../../../supabase/templates/${name}`, import.meta.url);
      const committed = await readFile(file, 'utf8').catch(() => '');
      const fresh = await SUPABASE_TEMPLATES[name]();
      expect(committed, 'Rode: pnpm --filter @trama/emails templates:supabase').toBe(fresh);
    },
  );
});

import { describe, expect, it, vi } from 'vitest';
import { defaultDeps, type Deps } from '../deps';
import type { Env } from '../env';
import { createVault } from '../drive/vault';
import type { Mailer, MailMessage } from '../mail';
import { createMemoryDigestStore } from './memory-store';
import { DAILY_EMAIL_LIMIT, runDigests, SUBREQUEST_BUDGET } from './run';
import type { Candidate, DigestData } from './store';
import { readUnsubscribeToken } from './unsubscribe';

const KEY = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i + 1)));
const ENV: Env = {
  APP_URL: 'https://trama.example',
  WORKERS_SUBDOMAIN: 'conta',
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_falsa',
  RESEND_API_KEY: 're_falsa',
  EMAIL_FROM: 'Trama <ola@trama.example>',
  TOKEN_ENCRYPTION_KEY: KEY,
};

/** Segunda, 30 de novembro de 2026, 11:00 UTC = 08:00 em São Paulo. */
const NOW = new Date('2026-11-30T11:00:00.000Z');

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function person(n: number, extra: Partial<Candidate> = {}): Candidate {
  return {
    userId: uid(n),
    email: `pessoa${String(n)}@exemplo.com`,
    name: `Pessoa ${String(n)}`,
    timezone: 'America/Sao_Paulo',
    localDate: '2026-11-30',
    ...extra,
  };
}

const WITH_STUDY: DigestData = {
  events: [
    {
      type: 'studied',
      occurredAt: '2026-11-25T17:00:00.000Z',
      projectKind: 'notebook',
      title: 'Atalhos de corte',
      detail: 'Premiere Pro',
    },
  ],
  lessons: [
    {
      title: 'Correção de cor',
      notebookTitle: 'Premiere Pro',
      status: 'done',
      reviewOn: '2026-11-30',
    },
  ],
};

function setup(options: { env?: Env; dailyLimit?: number; mailFails?: boolean } = {}) {
  const fake = createMemoryDigestStore(
    options.dailyLimit === undefined ? {} : { dailyLimit: options.dailyLimit },
  );
  const sent: MailMessage[] = [];
  const mailer: Mailer = {
    configured: true,
    send: (message) => {
      if (options.mailFails) return Promise.reject(new Error('Resend recusou o e-mail (500).'));
      sent.push(message);
      return Promise.resolve();
    },
  };
  const deps: Deps = {
    ...defaultDeps(),
    digest: () => fake.store,
    mailer: () => mailer,
    now: () => NOW,
  };
  const log = vi.fn();
  const run = () => runDigests(options.env ?? ENV, deps, { log });
  return { fake, sent, deps, log, run };
}

describe('resumo semanal', () => {
  it('manda o resumo com os dados da Agenda, o link de descadastro e o cabeçalho de um clique', async () => {
    const { fake, sent, run } = setup();
    fake.due.weekly_summary.push(person(1));
    fake.addPerson(uid(1));
    fake.dataByUser.set(uid(1), WITH_STUDY);

    const report = await run();
    expect(report.weekly_summary).toMatchObject({ candidates: 1, sent: 1 });
    expect(sent).toHaveLength(1);
    const [mail] = sent;
    expect(mail?.to).toBe('pessoa1@exemplo.com');
    expect(mail?.subject).toBe('Seu resumo de estudos da semana');
    expect(mail?.text).toContain('Atalhos de corte');
    expect(mail?.text).toContain('Correção de cor');
    expect(mail?.text).toContain('23 a 29 de novembro');

    // A semana pedida ao banco é a que passou, no fuso da pessoa; revisar vai até o domingo.
    expect(fake.dataRequests[0]).toEqual({
      userId: uid(1),
      from: '2026-11-23T03:00:00.000Z',
      to: '2026-11-30T03:00:00.000Z',
      reviewUntil: '2026-12-06',
    });

    // O link funciona sem login: token assinado, que só desliga o resumo semanal daquela pessoa.
    const link = /<(https:\/\/trama-api\.conta\.workers\.dev\/unsubscribe\?t=[^>]+)>/.exec(
      mail?.headers?.['List-Unsubscribe'] ?? '',
    )?.[1];
    expect(link).toBeDefined();
    expect(mail?.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(mail?.html).toContain(link!.replaceAll('&', '&amp;'));
    const token = decodeURIComponent(new URL(link!).searchParams.get('t')!);
    const vault = await createVault(KEY);
    expect(await readUnsubscribeToken(vault, token)).toEqual({
      userId: uid(1),
      kind: 'weekly_summary',
    });
  });

  it('não manda e-mail vazio e não gasta a reserva do dia', async () => {
    const { fake, sent, run } = setup();
    fake.due.weekly_summary.push(person(1));
    const report = await run();
    expect(report.weekly_summary).toMatchObject({ candidates: 1, sent: 0, empty: 1 });
    expect(sent).toHaveLength(0);
    expect(fake.claims.size).toBe(0);
  });

  it('não manda duas vezes a mesma pessoa no mesmo dia', async () => {
    const { fake, sent, run } = setup();
    fake.due.weekly_summary.push(person(1));
    fake.dataByUser.set(uid(1), WITH_STUDY);
    await run();
    const second = await run();
    expect(sent).toHaveLength(1);
    // Quem já recebeu nem aparece mais como candidato na hora seguinte.
    expect(second.weekly_summary.candidates).toBe(0);
  });

  it('o ponto de extensão da IA entra como parágrafo no alto', async () => {
    const { fake, sent, deps, log } = setup();
    fake.due.weekly_summary.push(person(1));
    fake.dataByUser.set(uid(1), WITH_STUDY);
    await runDigests(ENV, deps, { log, narrate: () => Promise.resolve('Semana forte de edição.') });
    expect(sent[0]?.text).toContain('Semana forte de edição.');
  });
});

describe('lembrete de revisão', () => {
  it('manda as aulas de hoje e usa o dia local como limite da revisão', async () => {
    const { fake, sent, run } = setup();
    fake.due.review_reminder.push(person(2, { localDate: '2026-12-01' }));
    fake.dataByUser.set(uid(2), WITH_STUDY);
    const report = await run();
    expect(report.review_reminder.sent).toBe(1);
    expect(sent[0]?.subject).toBe('Hoje tem 1 aula para revisar');
    expect(sent[0]?.text).toContain('Correção de cor');
    expect(fake.dataRequests[0]?.reviewUntil).toBe('2026-12-01');
    expect(sent[0]?.headers?.['List-Unsubscribe']).toContain('/unsubscribe?t=');
  });

  it('sem aula para revisar, não manda', async () => {
    const { fake, sent, run } = setup();
    fake.due.review_reminder.push(person(2));
    fake.dataByUser.set(uid(2), { events: WITH_STUDY.events, lessons: [] });
    const report = await run();
    expect(report.review_reminder.empty).toBe(1);
    expect(sent).toHaveLength(0);
  });
});

describe('limites', () => {
  it('para no limite de 100 envios por dia e registra, sem dado pessoal', async () => {
    const { fake, sent, log, run } = setup({ dailyLimit: 2 });
    for (let n = 1; n <= 5; n += 1) {
      fake.due.weekly_summary.push(person(n));
      fake.dataByUser.set(uid(n), WITH_STUDY);
    }
    const report = await run();
    expect(sent).toHaveLength(2);
    expect(report.dailyLimitReached).toBe(true);
    // Parou: nem o lembrete foi tentado.
    expect(report.review_reminder.candidates).toBe(0);
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).toContain('limite');
    expect(logged).not.toContain('@');
    expect(logged).not.toContain('Pessoa');
  });

  it('o limite padrão é o do plano grátis do Resend', () => {
    expect(DAILY_EMAIL_LIMIT).toBe(100);
  });

  it('respeita o orçamento de chamadas por execução do Worker', async () => {
    const { fake, sent, run } = setup();
    for (let n = 1; n <= 60; n += 1) {
      fake.due.weekly_summary.push(person(n));
      fake.dataByUser.set(uid(n), WITH_STUDY);
    }
    await run();
    // 1 chamada para listar e 4 por pessoa, no máximo.
    expect(fake.calls.length + sent.length).toBeLessThanOrEqual(SUBREQUEST_BUDGET);
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.length).toBeLessThan(60);
  });
});

describe('falhas', () => {
  it('se o Resend recusa, desfaz a reserva para tentar de novo na hora seguinte', async () => {
    const { fake, sent, run, log } = setup({ mailFails: true });
    fake.due.weekly_summary.push(person(1));
    fake.dataByUser.set(uid(1), WITH_STUDY);
    const report = await run();
    expect(report.weekly_summary.failed).toBe(1);
    expect(sent).toHaveLength(0);
    expect(fake.claims.size).toBe(0);
    expect(fake.calls).toContain('release');
    expect(JSON.stringify(log.mock.calls)).not.toContain('@');
  });

  it('uma pessoa que falha não impede a seguinte', async () => {
    const { fake, sent, run } = setup();
    fake.due.weekly_summary.push(person(1), person(2));
    fake.dataByUser.set(uid(2), WITH_STUDY);
    fake.failNext('data');
    const report = await run();
    expect(report.weekly_summary).toMatchObject({ failed: 1, sent: 1 });
    expect(sent.map((m) => m.to)).toEqual(['pessoa2@exemplo.com']);
  });

  it('erro ao listar os candidatos não derruba a tarefa', async () => {
    const { fake, run } = setup();
    fake.failNext('candidates');
    const report = await run();
    expect(report.weekly_summary.candidates).toBe(0);
  });
});

describe('configuração que falta', () => {
  it.each([
    ['SUPABASE_SECRET_KEY', { SUPABASE_SECRET_KEY: undefined }],
    ['TOKEN_ENCRYPTION_KEY', { TOKEN_ENCRYPTION_KEY: undefined }],
    ['RESEND_API_KEY', { RESEND_API_KEY: undefined }],
    ['WORKERS_SUBDOMAIN', { WORKERS_SUBDOMAIN: undefined, APP_URL: undefined }],
  ] as const)('sem %s, não manda nada e diz por quê', async (name, patch) => {
    const env = { ...ENV, ...patch } as Env;
    const fake = createMemoryDigestStore();
    fake.due.weekly_summary.push(person(1));
    fake.dataByUser.set(uid(1), WITH_STUDY);
    const sent: MailMessage[] = [];
    const log = vi.fn();
    const deps: Deps = {
      ...defaultDeps(),
      digest: (e) => (e.SUPABASE_SECRET_KEY ? fake.store : null),
      mailer: (e) => ({
        configured: Boolean(e.RESEND_API_KEY && e.EMAIL_FROM),
        send: (message) => {
          sent.push(message);
          return Promise.resolve();
        },
      }),
      now: () => NOW,
    };
    const report = await runDigests(env, deps, { log });
    expect(report.skipped).toBeDefined();
    expect(report.skipped).toContain(name === 'WORKERS_SUBDOMAIN' ? 'WORKERS_SUBDOMAIN' : name);
    expect(sent).toHaveLength(0);
    expect(fake.calls).toEqual([]);
  });
});

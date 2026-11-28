import { renderReviewReminderEmail, renderWeeklySummaryEmail } from '@trama/emails';
import type { Deps } from '../deps';
import type { Env } from '../env';
import {
  buildReminderContent,
  buildWeeklyContent,
  weeklyWindow,
  type SummaryNarrator,
} from './summary';
import type { Candidate, DigestKind, DigestStore } from './store';
import { apiBaseUrl, createUnsubscribeToken, siteBaseUrl, unsubscribeUrl } from './unsubscribe';

/** O plano grátis do Resend manda até 100 e-mails por dia. */
export const DAILY_EMAIL_LIMIT = 100;

/**
 * O plano grátis do Cloudflare Workers permite 50 chamadas a outros serviços (`fetch`) por
 * execução. Cada pessoa gasta até 4 (dados, reserva, envio e, se falhar, desfazer a reserva),
 * mais 1 por tipo para listar quem recebe. Parar antes do limite deixa o resto para a próxima
 * hora: a janela de envio vai das 8h às 10h59.
 */
export const SUBREQUEST_BUDGET = 44;
const PER_PERSON = 4;

export interface DigestReport {
  weekly_summary: KindReport;
  review_reminder: KindReport;
  /** Por que nada saiu (configuração que falta), quando for o caso. */
  skipped?: string;
  /** O limite de 100 envios do dia foi atingido. */
  dailyLimitReached: boolean;
}

export interface KindReport {
  candidates: number;
  sent: number;
  /** Sem nada para contar: o e-mail vazio não sai. */
  empty: number;
  /** Já enviado antes (a tarefa roda de hora em hora). */
  duplicate: number;
  failed: number;
}

const emptyReport = (): KindReport => ({
  candidates: 0,
  sent: 0,
  empty: 0,
  duplicate: 0,
  failed: 0,
});

export interface RunOptions {
  /** Parágrafo da IA para o alto do resumo (hoje ninguém define: só os dados da Agenda). */
  narrate?: SummaryNarrator;
  /** Onde registrar o que aconteceu. Nunca recebe e-mail, nome nem texto de e-mail. */
  log?: (message: string, counts?: Record<string, unknown>) => void;
}

const KINDS: DigestKind[] = ['weekly_summary', 'review_reminder'];

/**
 * A tarefa agendada (Cron Trigger de hora em hora): manda o resumo semanal (segunda, 8h no
 * fuso de cada pessoa) e o lembrete de revisão (todo dia, 8h). Quem escolhe quem está na hora é
 * o banco (`email_candidates`); aqui só se monta e se envia. Não manda e-mail vazio, não manda
 * duas vezes o mesmo e não passa de 100 envios por dia.
 */
export async function runDigests(
  env: Env,
  deps: Deps,
  options: RunOptions = {},
): Promise<DigestReport> {
  const log =
    options.log ??
    ((message, counts) => console.log(message, counts ? JSON.stringify(counts) : ''));
  const report: DigestReport = {
    weekly_summary: emptyReport(),
    review_reminder: emptyReport(),
    dailyLimitReached: false,
  };
  const skip = (reason: string): DigestReport => {
    log(`e-mails de estudo: nada enviado (${reason})`);
    return { ...report, skipped: reason };
  };

  const store = deps.digest(env);
  if (!store) return skip('falta a SUPABASE_SECRET_KEY no Worker');
  const mailer = deps.mailer(env);
  if (!mailer.configured) return skip('faltam RESEND_API_KEY e EMAIL_FROM no Worker');
  const vault = await deps.vault(env);
  if (!vault) return skip('falta a TOKEN_ENCRYPTION_KEY no Worker');
  const apiUrl = apiBaseUrl(env);
  if (!apiUrl) return skip('faltam API_URL ou WORKERS_SUBDOMAIN no Worker');
  const siteUrl = siteBaseUrl(env);
  if (!siteUrl) return skip('faltam APP_URL ou WORKERS_SUBDOMAIN no Worker');

  const now = deps.now();
  let budget = SUBREQUEST_BUDGET;

  for (const kind of KINDS) {
    if (report.dailyLimitReached || budget < 1 + PER_PERSON) break;
    budget -= 1;
    let candidates: Candidate[];
    try {
      candidates = await store.candidates(kind, now, Math.floor(budget / PER_PERSON));
    } catch {
      log(`e-mails de estudo: não deu para listar quem recebe (${kind})`);
      continue;
    }
    report[kind].candidates = candidates.length;

    for (const person of candidates) {
      if (budget < PER_PERSON) break;
      budget -= PER_PERSON;
      const outcome = await sendOne({
        kind,
        person,
        store,
        deps,
        env,
        vault,
        apiUrl,
        siteUrl,
        options,
      });
      if (outcome === 'limit') {
        report.dailyLimitReached = true;
        break;
      }
      report[kind][outcome] += 1;
    }
  }

  log('e-mails de estudo', {
    weekly: report.weekly_summary,
    reminder: report.review_reminder,
    dailyLimitReached: report.dailyLimitReached,
  });
  if (report.dailyLimitReached) {
    log(`e-mails de estudo: limite de ${String(DAILY_EMAIL_LIMIT)} envios por dia atingido; parei`);
  }
  return report;
}

interface SendContext {
  kind: DigestKind;
  person: Candidate;
  store: DigestStore;
  deps: Deps;
  env: Env;
  vault: NonNullable<Awaited<ReturnType<Deps['vault']>>>;
  apiUrl: string;
  siteUrl: string;
  options: RunOptions;
}

/** Monta e envia o e-mail de uma pessoa. Devolve o que aconteceu; nunca lança. */
async function sendOne(
  ctx: SendContext,
): Promise<'sent' | 'empty' | 'duplicate' | 'failed' | 'limit'> {
  const { kind, person, store, deps, env, vault, apiUrl, siteUrl, options } = ctx;
  const now = deps.now();
  let claimed = false;
  try {
    const week = weeklyWindow(person.localDate, person.timezone);
    // O lembrete não lê eventos: o intervalo vazio (agora até agora) os deixa de fora.
    const data = await store.data(person.userId, {
      from: kind === 'weekly_summary' ? week.from : now.toISOString(),
      to: kind === 'weekly_summary' ? week.to : now.toISOString(),
      reviewUntil: kind === 'weekly_summary' ? week.reviewUntil : person.localDate,
    });

    const link = unsubscribeUrl(apiUrl, await createUnsubscribeToken(vault, person.userId, kind));
    const common = { name: person.name, siteUrl, unsubscribeUrl: link };
    let email;
    if (kind === 'weekly_summary') {
      const content = buildWeeklyContent(data, {
        localDate: person.localDate,
        timeZone: person.timezone,
      });
      if (content.empty) return 'empty';
      const intro = (await options.narrate?.(content)) ?? undefined;
      email = await renderWeeklySummaryEmail({
        ...common,
        rangeLabel: content.rangeLabel,
        studied: content.studied,
        completed: content.completed,
        toReview: content.toReview,
        intro,
      });
    } else {
      const lessons = buildReminderContent(data, person.localDate);
      if (lessons.items.length === 0) return 'empty';
      email = await renderReviewReminderEmail({ ...common, lessons });
    }

    const claim = await store.claim(person.userId, kind, person.localDate, DAILY_EMAIL_LIMIT);
    if (claim === 'limit') return 'limit';
    if (claim === 'duplicate') return 'duplicate';
    claimed = true;

    await deps.mailer(env).send({
      to: person.email,
      ...email,
      headers: {
        'List-Unsubscribe': `<${link}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
    return 'sent';
  } catch (error) {
    // Sem dado pessoal no log: só o tipo do e-mail e o motivo (sem e-mail nem nome).
    console.error(
      'e-mails de estudo: um envio falhou',
      kind,
      error instanceof Error && error.name !== 'ZodError' ? error.message : 'erro',
    );
    if (claimed) {
      // Desfaz a reserva: a próxima hora da janela (até as 10h59) tenta de novo.
      await store.release(person.userId, kind, person.localDate).catch(() => undefined);
    }
    return 'failed';
  }
}

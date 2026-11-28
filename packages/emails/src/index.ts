import { render } from '@react-email/render';
import { createElement } from 'react';
import { DriveNoticeEmail, type DriveNoticeEmailProps } from './DriveNoticeEmail';
import { RecoveryEmail, type RecoveryEmailProps } from './RecoveryEmail';
import { ReviewReminderEmail, type ReviewReminderEmailProps } from './ReviewReminderEmail';
import { WeeklySummaryEmail, type WeeklySummaryEmailProps } from './WeeklySummaryEmail';
import { WelcomeEmail, type WelcomeEmailProps } from './WelcomeEmail';

export { EmailLayout } from './Layout';
export { logoUrl } from './styles';
export { DriveNoticeEmail, type DriveNoticeEmailProps } from './DriveNoticeEmail';
export { EmailChangeEmail, type EmailChangeEmailProps } from './EmailChangeEmail';
export { RecoveryEmail, type RecoveryEmailProps } from './RecoveryEmail';
export { ReviewReminderEmail, type ReviewReminderEmailProps } from './ReviewReminderEmail';
export { WeeklySummaryEmail, type WeeklySummaryEmailProps } from './WeeklySummaryEmail';
export { type DigestLine, type DigestList } from './DigestSection';
export { WelcomeEmail, type WelcomeEmailProps } from './WelcomeEmail';

export interface RenderedEmail {
  subject: string;
  html: string;
  /** Versão em texto puro, para programas que não mostram HTML. */
  text: string;
}

async function renderBoth(element: Parameters<typeof render>[0]) {
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { html, text };
}

/** E-mail de boas-vindas, pronto para o Resend. */
export async function renderWelcomeEmail(props: WelcomeEmailProps): Promise<RenderedEmail> {
  return {
    subject: 'Boas-vindas ao Trama',
    ...(await renderBoth(createElement(WelcomeEmail, props))),
  };
}

/** E-mail de recuperação de senha. */
export async function renderRecoveryEmail(props: RecoveryEmailProps): Promise<RenderedEmail> {
  return {
    subject: 'Crie uma senha nova no Trama',
    ...(await renderBoth(createElement(RecoveryEmail, props))),
  };
}

/** "Aviso do Drive": a cópia para o Google Drive falhou 3 vezes seguidas. */
export async function renderDriveNoticeEmail(props: DriveNoticeEmailProps): Promise<RenderedEmail> {
  return {
    subject: 'Não deu para copiar seus projetos para o Drive',
    ...(await renderBoth(createElement(DriveNoticeEmail, props))),
  };
}

/** Resumo semanal de estudos (segunda, 8h): o que estudou, o que revisar e o que concluiu. */
export async function renderWeeklySummaryEmail(
  props: WeeklySummaryEmailProps,
): Promise<RenderedEmail> {
  return {
    subject: 'Seu resumo de estudos da semana',
    ...(await renderBoth(createElement(WeeklySummaryEmail, props))),
  };
}

/** Lembrete de revisão: as aulas cuja revisão é hoje (ou já passou). */
export async function renderReviewReminderEmail(
  props: ReviewReminderEmailProps,
): Promise<RenderedEmail> {
  const total = props.lessons.items.length + props.lessons.more;
  return {
    subject:
      total === 1 ? 'Hoje tem 1 aula para revisar' : `Hoje tem ${String(total)} aulas para revisar`,
    ...(await renderBoth(createElement(ReviewReminderEmail, props))),
  };
}

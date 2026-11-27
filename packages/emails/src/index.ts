import { render } from '@react-email/render';
import { createElement } from 'react';
import { RecoveryEmail, type RecoveryEmailProps } from './RecoveryEmail';
import { WelcomeEmail, type WelcomeEmailProps } from './WelcomeEmail';

export { EmailLayout } from './Layout';
export { logoUrl } from './styles';
export { RecoveryEmail, type RecoveryEmailProps } from './RecoveryEmail';
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

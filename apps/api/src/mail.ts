export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Envio de e-mail. `configured` é falso quando faltam RESEND_API_KEY ou EMAIL_FROM no Worker. */
export interface Mailer {
  configured: boolean;
  send(message: MailMessage): Promise<void>;
}

/** Envia pelo Resend (https://resend.com/docs/api-reference/emails/send-email). */
export function createResendMailer(
  env: { RESEND_API_KEY?: string; EMAIL_FROM?: string },
  fetcher: typeof fetch = (...args) => fetch(...args),
): Mailer {
  const { RESEND_API_KEY: apiKey, EMAIL_FROM: from } = env;
  return {
    configured: Boolean(apiKey && from),
    async send({ to, subject, html, text }) {
      if (!apiKey || !from) throw new Error('Faltam RESEND_API_KEY e EMAIL_FROM no Worker.');
      const response = await fetcher('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject, html, text }),
      });
      if (!response.ok) {
        // O corpo do erro do Resend não traz segredo, mas também não precisa ir para o log inteiro.
        throw new Error(`Resend recusou o e-mail (${String(response.status)}).`);
      }
      await response.body?.cancel().catch(() => undefined);
    },
  };
}

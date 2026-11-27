import { colors, fonts } from '@trama/ui/tokens';

/** Endereço do logo em PNG, servido pelo próprio site (apps/web/public/email/logo.png). */
export function logoUrl(siteUrl: string): string {
  return `${siteUrl.replace(/\/$/, '')}/email/logo.png`;
}

/** Estilos compartilhados pelo conteúdo dos e-mails. */
export const emailText = {
  heading: {
    margin: '0 0 12px',
    fontFamily: fonts.serif,
    fontSize: '24px',
    lineHeight: '30px',
    fontWeight: 600,
    color: colors.textStrong,
  },
  paragraph: {
    margin: '0 0 16px',
    fontSize: '15px',
    lineHeight: '24px',
    color: colors.text,
  },
  button: {
    display: 'inline-block',
    backgroundColor: colors.textStrong,
    color: colors.brandInk,
    borderRadius: '8px',
    padding: '12px 20px',
    fontSize: '15px',
    fontWeight: 600,
    textDecoration: 'none',
  },
  small: {
    margin: '20px 0 0',
    fontSize: '13px',
    lineHeight: '20px',
    color: colors.textMuted,
  },
  link: {
    color: colors.text,
    textDecoration: 'underline',
    wordBreak: 'break-all',
  },
} as const;

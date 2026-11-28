import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Column,
  Section,
  Text,
} from '@react-email/components';
import type { ReactNode } from 'react';
import { colors, fonts } from '@trama/ui/tokens';
import { logoUrl } from './styles';

interface EmailLayoutProps {
  /** Texto que o programa de e-mail mostra ao lado do assunto. */
  preview: string;
  /** Endereço do site, sem barra no fim. */
  siteUrl: string;
  /** Por que a pessoa recebeu este e-mail. */
  reason: string;
  /** Link de descadastro (os e-mails de resumo e lembrete têm; os da conta não). */
  unsubscribe?: { href: string; label: string };
  children: ReactNode;
}

/**
 * Moldura de todo e-mail do Trama: o mesmo preto e branco do app, com o logo no topo.
 * Só estilos inline e tabelas (o que o React Email gera), que é o que os programas de
 * e-mail entendem.
 */
export function EmailLayout({ preview, siteUrl, reason, unsubscribe, children }: EmailLayoutProps) {
  return (
    <Html lang="pt-BR" dir="ltr">
      <Head>
        <meta name="color-scheme" content="dark" />
        <meta name="supported-color-schemes" content="dark" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Row>
              <Column style={{ width: '48px' }}>
                <Link href={siteUrl} style={styles.brandLink}>
                  <Img
                    src={logoUrl(siteUrl)}
                    width="40"
                    height="40"
                    alt="Trama"
                    style={styles.logo}
                  />
                </Link>
              </Column>
              <Column>
                <Text style={styles.wordmark}>Trama</Text>
              </Column>
            </Row>
          </Section>
          <Section style={styles.card}>{children}</Section>
          <Text style={styles.footer}>
            {reason}
            {unsubscribe ? (
              <>
                {' '}
                <Link href={unsubscribe.href} style={styles.footerLink}>
                  {unsubscribe.label}
                </Link>
              </>
            ) : null}
            <br />
            Trama · o quadro visual para os seus fluxos, aulas e roteiros.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const styles = {
  body: {
    margin: 0,
    padding: '32px 0',
    backgroundColor: colors.canvas,
    fontFamily: fonts.sans,
    color: colors.text,
  },
  container: {
    width: '100%',
    maxWidth: '480px',
    margin: '0 auto',
    padding: '0 16px',
  },
  header: { padding: '0 4px 20px' },
  brandLink: { textDecoration: 'none' },
  logo: { display: 'block', border: 0 },
  wordmark: {
    margin: 0,
    fontFamily: fonts.serif,
    fontSize: '24px',
    lineHeight: '40px',
    fontWeight: 600,
    letterSpacing: '-0.02em',
    color: colors.textStrong,
  },
  card: {
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    padding: '32px 28px',
  },
  footer: {
    margin: '20px 4px 0',
    fontSize: '12px',
    lineHeight: '18px',
    color: colors.textMuted,
  },
  footerLink: { color: colors.textMuted, textDecoration: 'underline' },
} as const;

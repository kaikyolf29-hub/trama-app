import { Button, Heading, Link, Text } from '@react-email/components';
import { EmailLayout } from './Layout';
import { emailText } from './styles';

export interface EmailChangeEmailProps {
  /** Link que leva à tela que confirma a troca. */
  confirmUrl: string;
  siteUrl: string;
  /** Endereço de entrada de agora. */
  currentEmail: string;
  /** Endereço novo, que a pessoa pediu. */
  newEmail: string;
  /** Saudação já montada, ex.: "Olá, Ana." */
  greeting?: string;
}

/**
 * E-mail de troca de endereço. Sai pelo Supabase Auth, com o Resend como servidor, e vai aos dois
 * endereços (confirmação dupla): o mesmo texto serve aos dois.
 */
export function EmailChangeEmail({
  confirmUrl,
  siteUrl,
  currentEmail,
  newEmail,
  greeting = 'Olá.',
}: EmailChangeEmailProps) {
  return (
    <EmailLayout
      preview="Confirme a troca do e-mail da sua conta no Trama."
      siteUrl={siteUrl}
      reason="Você recebeu este e-mail porque alguém pediu para trocar o e-mail desta conta do Trama."
    >
      <Heading as="h1" style={emailText.heading}>
        Confirme o novo e-mail
      </Heading>
      <Text style={emailText.paragraph}>{greeting}</Text>
      <Text style={emailText.paragraph}>
        Recebemos um pedido para trocar o e-mail da sua conta de {currentEmail} para {newEmail}.
        Enviamos este aviso aos dois endereços, e a troca só vale depois que você abrir o link dos
        dois. O link só funciona uma vez.
      </Text>
      <Button href={confirmUrl} style={emailText.button}>
        Confirmar a troca
      </Button>
      <Text style={emailText.small}>
        Se o botão não abrir, copie este endereço no navegador:
        <br />
        <Link href={confirmUrl} style={emailText.link}>
          {confirmUrl}
        </Link>
      </Text>
      <Text style={emailText.small}>
        Não pediu? Pode ignorar este e-mail: o endereço da conta continua o mesmo.
      </Text>
    </EmailLayout>
  );
}

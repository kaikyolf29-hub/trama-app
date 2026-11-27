import { Button, Heading, Link, Text } from '@react-email/components';
import { EmailLayout } from './Layout';
import { emailText } from './styles';

export interface RecoveryEmailProps {
  /** Link que leva à tela de criar a senha nova. */
  resetUrl: string;
  siteUrl: string;
  /** Saudação já montada, ex.: "Olá, Ana." */
  greeting?: string;
  /** Por quanto tempo o link vale, em texto. */
  expiresIn?: string;
}

/** E-mail de recuperação de senha. Sai pelo Supabase Auth, com o Resend como servidor. */
export function RecoveryEmail({
  resetUrl,
  siteUrl,
  greeting = 'Olá.',
  expiresIn = '1 hora',
}: RecoveryEmailProps) {
  return (
    <EmailLayout
      preview="Use o link para criar uma senha nova no Trama."
      siteUrl={siteUrl}
      reason="Você recebeu este e-mail porque alguém pediu uma senha nova para esta conta do Trama."
    >
      <Heading as="h1" style={emailText.heading}>
        Crie uma senha nova
      </Heading>
      <Text style={emailText.paragraph}>{greeting}</Text>
      <Text style={emailText.paragraph}>
        Recebemos um pedido para trocar a senha da sua conta. Clique no botão para escolher a nova
        senha. O link vale por {expiresIn} e só funciona uma vez.
      </Text>
      <Button href={resetUrl} style={emailText.button}>
        Criar senha nova
      </Button>
      <Text style={emailText.small}>
        Se o botão não abrir, copie este endereço no navegador:
        <br />
        <Link href={resetUrl} style={emailText.link}>
          {resetUrl}
        </Link>
      </Text>
      <Text style={emailText.small}>
        Não pediu? Pode ignorar este e-mail: sua senha continua a mesma.
      </Text>
    </EmailLayout>
  );
}

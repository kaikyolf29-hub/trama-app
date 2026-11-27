import { Button, Heading, Text } from '@react-email/components';
import { colors } from '@trama/ui/tokens';
import { EmailLayout } from './Layout';
import { emailText } from './styles';

export interface WelcomeEmailProps {
  /** Nome que a pessoa deu no cadastro. */
  name: string;
  siteUrl: string;
}

const STARTERS = [
  ['Fluxo de vídeo', 'tema, thumbnail, vídeo, roteiro e o selo “Vídeo pronto” num quadro só.'],
  ['Aula por etapas', 'os blocos aparecem um de cada vez, na ordem que você escolher.'],
  ['Seus dados, no seu Drive', 'cada projeto ganha uma cópia na pasta “Trama” do Google Drive.'],
] as const;

/** Boas-vindas, logo depois do cadastro, com o link para o primeiro fluxo. */
export function WelcomeEmail({ name, siteUrl }: WelcomeEmailProps) {
  const firstName = name.trim().split(/\s+/)[0] || 'você';
  return (
    <EmailLayout
      preview="Sua conta no Trama está pronta. Comece pelo primeiro fluxo."
      siteUrl={siteUrl}
      reason="Você recebeu este e-mail porque criou uma conta no Trama."
    >
      <Heading as="h1" style={emailText.heading}>
        Boas-vindas ao Trama, {firstName}
      </Heading>
      <Text style={emailText.paragraph}>
        Sua conta está pronta. O Trama é um quadro para ver as partes de um projeto ligadas: arraste
        blocos, ligue com setas e agrupe em molduras.
      </Text>
      {STARTERS.map(([title, text]) => (
        <Text key={title} style={starter}>
          <strong style={{ color: colors.textStrong }}>{title}:</strong> {text}
        </Text>
      ))}
      <Button href={siteUrl} style={{ ...emailText.button, marginTop: '8px' }}>
        Criar meu primeiro fluxo
      </Button>
    </EmailLayout>
  );
}

const starter = {
  ...emailText.paragraph,
  margin: '0 0 10px',
  paddingLeft: '12px',
  borderLeft: `2px solid ${colors.border}`,
} as const;

import { Button, Heading, Text } from '@react-email/components';
import { colors } from '@trama/ui/tokens';
import { EmailLayout } from './Layout';
import { emailText } from './styles';

export interface DriveNoticeEmailProps {
  /** Nome que a pessoa deu no cadastro (pode estar vazio). */
  name?: string;
  siteUrl: string;
  /** O motivo, em uma frase (ex.: "O Google recusou o acesso."), quando se sabe. */
  reason?: string;
}

/** "Aviso do Drive": a cópia para o Google Drive falhou 3 vezes seguidas. */
export function DriveNoticeEmail({ name = '', siteUrl, reason }: DriveNoticeEmailProps) {
  const firstName = name.trim().split(/\s+/)[0];
  return (
    <EmailLayout
      preview="A cópia dos seus projetos para o Google Drive não está funcionando."
      siteUrl={siteUrl}
      reason="Você recebeu este aviso porque conectou o Google Drive ao Trama e a cópia falhou 3 vezes seguidas."
    >
      <Heading as="h1" style={emailText.heading}>
        Não deu para copiar para o Drive
      </Heading>
      <Text style={emailText.paragraph}>{firstName ? `Olá, ${firstName}.` : 'Olá.'}</Text>
      <Text style={emailText.paragraph}>
        A cópia dos seus projetos para a pasta “Trama” do Google Drive falhou 3 vezes seguidas. Seus
        projetos continuam salvos no Trama e nada se perdeu; só a cópia no Drive está parada.
      </Text>
      {reason ? (
        <Text style={detail}>
          <strong style={{ color: colors.textStrong }}>Motivo:</strong> {reason}
        </Text>
      ) : null}
      <Text style={emailText.paragraph}>
        Na maioria das vezes basta conectar o Drive de novo: abra o Trama, vá em Início e use
        “Conectar de novo” no aviso do Google Drive. Depois disso a cópia volta sozinha.
      </Text>
      <Button href={siteUrl} style={emailText.button}>
        Abrir o Trama
      </Button>
      <Text style={emailText.small}>
        Se você desconectou o Drive de propósito, pode ignorar este aviso.
      </Text>
    </EmailLayout>
  );
}

const detail = {
  ...emailText.paragraph,
  paddingLeft: '12px',
  borderLeft: `2px solid ${colors.border}`,
} as const;

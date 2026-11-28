import { Button, Heading, Text } from '@react-email/components';
import { DigestSection, type DigestList } from './DigestSection';
import { EmailLayout } from './Layout';
import { emailText, studiesUrl } from './styles';

export interface ReviewReminderEmailProps {
  /** Nome que a pessoa deu no cadastro (pode estar vazio). */
  name?: string;
  siteUrl: string;
  /** Link de descadastro que funciona sem login (desliga só o lembrete de revisão). */
  unsubscribeUrl: string;
  /** As aulas com a revisão marcada para hoje (ou que já passaram do dia). */
  lessons: DigestList;
}

/** Lembrete de revisão: sai às 8h no dia em que há aulas para revisar. */
export function ReviewReminderEmail({
  name = '',
  siteUrl,
  unsubscribeUrl,
  lessons,
}: ReviewReminderEmailProps) {
  const firstName = name.trim().split(/\s+/)[0];
  const total = lessons.items.length + lessons.more;
  return (
    <EmailLayout
      preview={
        total === 1 ? 'Tem uma aula esperando a sua revisão.' : 'Tem aulas esperando a sua revisão.'
      }
      siteUrl={siteUrl}
      reason="Você recebeu este lembrete porque ligou o lembrete de revisão em Configurações."
      unsubscribe={{ href: unsubscribeUrl, label: 'Parar de receber o lembrete de revisão' }}
    >
      <Heading as="h1" style={emailText.heading}>
        {total === 1
          ? 'Hoje tem 1 aula para revisar'
          : `Hoje tem ${String(total)} aulas para revisar`}
      </Heading>
      <Text style={emailText.paragraph}>{firstName ? `Olá, ${firstName}.` : 'Olá.'}</Text>
      <Text style={emailText.paragraph}>
        Revisar logo depois do prazo é o que faz o conteúdo ficar. Quando terminar, marque “Revisei”
        em cada aula e o Trama agenda a próxima revisão.
      </Text>
      <DigestSection title="Para revisar" list={lessons} />
      <Button href={studiesUrl(siteUrl)} style={{ ...emailText.button, marginTop: '20px' }}>
        Revisar agora
      </Button>
    </EmailLayout>
  );
}

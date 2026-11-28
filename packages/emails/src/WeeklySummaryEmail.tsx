import { Button, Heading, Text } from '@react-email/components';
import { DigestSection, type DigestList } from './DigestSection';
import { EmailLayout } from './Layout';
import { emailText, studiesUrl } from './styles';

export interface WeeklySummaryEmailProps {
  /** Nome que a pessoa deu no cadastro (pode estar vazio). */
  name?: string;
  siteUrl: string;
  /** Link de descadastro que funciona sem login (desliga só o resumo semanal). */
  unsubscribeUrl: string;
  /** A semana resumida, em palavras: "23 a 29 de novembro". */
  rangeLabel: string;
  /** Aulas estudadas e revisadas na semana. */
  studied: DigestList;
  /** Aulas cuja revisão cai na semana que começa (ou já passou). */
  toReview: DigestList;
  /** Vídeos e outros projetos marcados como concluídos na semana. */
  completed: DigestList;
  /**
   * Ponto de extensão para a IA (depois): um parágrafo no alto, escrito a partir dos dados da
   * semana. Sem ele, o e-mail é só a lista, montada dos dados da Agenda.
   */
  intro?: string | undefined;
}

/** Resumo semanal de estudos: sai na segunda, às 8h no fuso da pessoa. */
export function WeeklySummaryEmail({
  name = '',
  siteUrl,
  unsubscribeUrl,
  rangeLabel,
  studied,
  toReview,
  completed,
  intro,
}: WeeklySummaryEmailProps) {
  const firstName = name.trim().split(/\s+/)[0];
  return (
    <EmailLayout
      preview={`Sua semana no Trama: ${rangeLabel}.`}
      siteUrl={siteUrl}
      reason="Você recebeu este resumo porque ele está ligado em Configurações."
      unsubscribe={{ href: unsubscribeUrl, label: 'Parar de receber o resumo semanal' }}
    >
      <Heading as="h1" style={emailText.heading}>
        Sua semana de estudos
      </Heading>
      <Text style={emailText.small}>{rangeLabel}</Text>
      <Text style={{ ...emailText.paragraph, marginTop: '16px' }}>
        {firstName ? `Olá, ${firstName}.` : 'Olá.'}
      </Text>
      {intro ? <Text style={emailText.paragraph}>{intro}</Text> : null}
      <DigestSection title="Você estudou" list={studied} />
      <DigestSection title="Você concluiu" list={completed} />
      <DigestSection title="Para revisar nesta semana" list={toReview} />
      <Button href={studiesUrl(siteUrl)} style={{ ...emailText.button, marginTop: '20px' }}>
        Abrir os Estudos
      </Button>
    </EmailLayout>
  );
}

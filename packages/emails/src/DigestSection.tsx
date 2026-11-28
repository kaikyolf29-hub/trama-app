import { Heading, Text } from '@react-email/components';
import { colors } from '@trama/ui/tokens';
import { emailText } from './styles';

/** Uma linha de uma lista do resumo: o título e, abaixo, uma frase curta (caderno, dia...). */
export interface DigestLine {
  title: string;
  detail?: string | undefined;
}

/** Uma lista já cortada no tamanho do e-mail; `more` é quantas ficaram de fora. */
export interface DigestList {
  items: DigestLine[];
  more: number;
}

/** Um bloco do resumo ("Você estudou", "Para revisar"): título, linhas e "e mais N". */
export function DigestSection({ title, list }: { title: string; list: DigestList }) {
  if (list.items.length === 0) return null;
  return (
    <>
      <Heading as="h2" style={styles.heading}>
        {title}
      </Heading>
      {list.items.map((line, index) => (
        <Text key={`${line.title}-${String(index)}`} style={styles.line}>
          <strong style={{ color: colors.textStrong }}>{line.title}</strong>
          {line.detail ? (
            <>
              <br />
              <span style={{ color: colors.textMuted }}>{line.detail}</span>
            </>
          ) : null}
        </Text>
      ))}
      {list.more > 0 ? (
        <Text style={emailText.small}>
          e mais {list.more} {list.more === 1 ? 'item' : 'itens'}, no Trama.
        </Text>
      ) : null}
    </>
  );
}

const styles = {
  heading: {
    margin: '24px 0 10px',
    fontSize: '13px',
    lineHeight: '18px',
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  line: {
    ...emailText.paragraph,
    margin: '0 0 10px',
    paddingLeft: '12px',
    borderLeft: `2px solid ${colors.border}`,
    fontSize: '14px',
    lineHeight: '20px',
  },
} as const;

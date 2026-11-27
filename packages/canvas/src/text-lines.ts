/** Um trecho do texto de um bloco: parágrafo, lista com marcadores ou lista numerada. */
export type TextPart =
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'numbered'; items: string[] };

const BULLET = /^[-*•]\s+(.*)$/;
const NUMBERED = /^\d+[.)]\s+(.*)$/;

/**
 * Lê o texto simples de um bloco (convenção do core): linhas que começam com "- " viram
 * lista com marcadores; com "1. ", lista numerada. Linhas seguidas do mesmo tipo de lista
 * formam uma lista só.
 */
export function parseTextLines(text: string): TextPart[] {
  const parts: TextPart[] = [];
  for (const line of text.split('\n')) {
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const last = parts.at(-1);
    if (bullet) {
      if (last?.kind === 'bullets') last.items.push(bullet[1] ?? '');
      else parts.push({ kind: 'bullets', items: [bullet[1] ?? ''] });
    } else if (numbered) {
      if (last?.kind === 'numbered') last.items.push(numbered[1] ?? '');
      else parts.push({ kind: 'numbered', items: [numbered[1] ?? ''] });
    } else if (line.trim() !== '') {
      parts.push({ kind: 'paragraph', text: line });
    }
  }
  return parts;
}

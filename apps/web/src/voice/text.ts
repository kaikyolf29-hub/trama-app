/** Texto da transcrição: limpar o que o Whisper devolve e juntar os pedaços. */

/**
 * Arruma o texto de um pedaço: espaços repetidos viram um só. Devolve "" quando não sobra
 * fala, ou seja, só pontuação ou só uma etiqueta de som que o Whisper põe no silêncio,
 * como "[Música]" ou "(aplausos)".
 */
export function cleanChunkText(raw: string): string {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!/[\p{L}\p{N}]/u.test(text)) return '';
  if (/^[[(][^\])]*[\])][.!?…]*$/u.test(text)) return '';
  return text;
}

/** Junta o texto novo ao que já existe, com um espaço no meio (sem mexer no que a pessoa corrigiu). */
export function appendTranscript(current: string, addition: string): string {
  const next = cleanChunkText(addition);
  if (!next) return current;
  if (current.trim() === '') return next;
  return /\s$/.test(current) ? current + next : `${current} ${next}`;
}

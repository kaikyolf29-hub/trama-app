/** Por que o microfone não funcionou. */
export type MicErrorKind = 'denied' | 'no-device' | 'busy' | 'unsupported' | 'lost' | 'unknown';

/** Traduz o erro do `getUserMedia` (e o do contexto de áudio) para um motivo que a pessoa entende. */
export function classifyMicError(error: unknown): MicErrorKind {
  const name = error instanceof Error || error instanceof DOMException ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'denied';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'no-device';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'busy';
    case 'UnsupportedError':
      return 'unsupported';
    default:
      return 'unknown';
  }
}

/** O texto para a pessoa, já dizendo o que fazer. */
export const micErrorText: Record<MicErrorKind, string> = {
  denied:
    'O navegador não deixou o Trama usar o microfone. Clique no cadeado ao lado do endereço do site, permita o microfone e aperte o botão de novo.',
  'no-device':
    'Não encontramos um microfone. Conecte um, confira se o sistema o reconhece e tente de novo.',
  busy: 'O microfone está em uso por outro programa ou aba. Feche o outro uso e tente de novo.',
  unsupported:
    'Este navegador não deixa gravar áudio aqui. Use uma versão recente do Chrome, Edge, Firefox ou Safari, com o site aberto por https.',
  lost: 'O microfone parou de enviar áudio. O que foi gravado até aqui entrou no texto.',
  unknown: 'Não deu para usar o microfone. Tente de novo; se continuar, recarregue a página.',
};

import type { FlowContentInput } from '../flow';

/**
 * Modelo "Falar e organizar". O projeto abre na tela de voz (`/p/<id>/falar`), onde a pessoa fala
 * e a IA organiza; o quadro nasce vazio e recebe os blocos quando ela clica em "Inserir no
 * quadro" (etapa 3.3). Antes dessa etapa o quadro trazia uma nota dizendo que a voz chegaria
 * depois e uma moldura vazia; as duas saíram, para o resultado da IA não cair ao lado de um aviso
 * que já não vale.
 */
export const voiceTemplateContent = {
  schemaVersion: 1,
} satisfies FlowContentInput;

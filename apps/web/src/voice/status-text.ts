import { formatElapsed, type ModelStatus, type VoiceState } from './recording-state';

/** As duas linhas ao lado do botão do microfone. */
export function statusLines(state: VoiceState, hasText: boolean): { title: string; hint: string } {
  switch (state.phase) {
    case 'starting':
      return {
        title: 'Abrindo o microfone…',
        hint: 'Se o navegador pedir, permita o uso do microfone.',
      };
    case 'recording':
      return {
        title: `Gravando · ${formatElapsed(state.seconds)}`,
        hint: 'Fale do jeito que vier. Pode repetir, voltar atrás, mudar de ideia.',
      };
    case 'finishing':
      return {
        title: 'Transcrevendo o final…',
        hint:
          state.pending === 1
            ? 'Falta 1 trecho.'
            : `Faltam ${state.pending} trechos. Pode corrigir o texto enquanto isso.`,
      };
    case 'idle':
      return {
        title: 'Pronto para gravar',
        hint: hasText
          ? 'Aperte o microfone para continuar: o que você falar entra no fim do texto.'
          : 'Aperte o microfone e fale do jeito que vier.',
      };
  }
}

/** O que dizer sobre o modelo de voz enquanto ele baixa ou depois de uma falha; null se não há o que dizer. */
export function modelNotice(model: ModelStatus): string | null {
  switch (model.status) {
    case 'loading':
      // Em 100% o download acabou; falta montar o modelo na memória (e na placa de vídeo).
      return model.percent === null || model.percent >= 100
        ? 'Preparando o modelo de voz…'
        : `Baixando o modelo de voz, só na primeira vez: ${model.percent}%`;
    case 'failed':
      return 'Não deu para carregar o modelo de voz. Confira a internet e tente de novo.';
    default:
      return null;
  }
}

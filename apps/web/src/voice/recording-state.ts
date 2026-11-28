import type { ComputeDevice } from './device';
import type { MicErrorKind } from './mic-errors';

/** Uma gravação inteira tem no máximo 10 minutos; depois, a pessoa aperta o microfone de novo. */
export const MAX_RECORDING_SECONDS = 600;

/** Quantas barras do desenho da onda ficam na tela. */
export const WAVE_BARS = 28;

export type RecordingPhase =
  /** Parado, pronto para gravar. */
  | 'idle'
  /** Pediu o microfone e espera a resposta do navegador. */
  | 'starting'
  | 'recording'
  /** Parou de gravar, mas ainda há trechos para transcrever. */
  | 'finishing';

export type ModelStatus =
  | { status: 'idle' }
  /** `percent` é null enquanto não há como saber (carregando do cache ou iniciando). */
  | { status: 'loading'; percent: number | null }
  | { status: 'ready'; device: ComputeDevice }
  | { status: 'failed'; message: string };

export interface VoiceState {
  phase: RecordingPhase;
  /** Segundos gravados nesta gravação (contados pelas amostras, não por um relógio). */
  seconds: number;
  /** Os últimos níveis de volume (0 a 1), do mais antigo para o mais novo. */
  levels: number[];
  micError: MicErrorKind | null;
  model: ModelStatus;
  /** Trechos que esperam ou estão sendo transcritos. */
  pending: number;
  /** Trechos que o Whisper não conseguiu transcrever. */
  failedChunks: number;
  /** A última gravação parou sozinha no limite de 10 minutos. */
  limitReached: boolean;
}

export const initialVoiceState: VoiceState = {
  phase: 'idle',
  seconds: 0,
  levels: [],
  micError: null,
  model: { status: 'idle' },
  pending: 0,
  failedChunks: 0,
  limitReached: false,
};

export type VoiceEvent =
  | { type: 'start' }
  | { type: 'mic-ready' }
  | { type: 'mic-failed'; kind: MicErrorKind }
  | { type: 'audio'; seconds: number; level: number }
  | { type: 'limit' }
  /** A gravação parou (e os trechos que restavam já foram para a fila). */
  | { type: 'stop' }
  | { type: 'model-loading'; percent: number | null }
  | { type: 'model-ready'; device: ComputeDevice }
  | { type: 'model-failed'; message: string }
  | { type: 'chunk-queued' }
  | { type: 'chunk-done' }
  | { type: 'chunk-failed' }
  /** A pessoa desistiu dos trechos que faltavam. */
  | { type: 'discard' };

/** Fecha a fase "finishing" quando não resta nada na fila. */
function settle(state: VoiceState): VoiceState {
  return state.phase === 'finishing' && state.pending === 0 ? { ...state, phase: 'idle' } : state;
}

export function voiceReducer(state: VoiceState, event: VoiceEvent): VoiceState {
  switch (event.type) {
    case 'start':
      if (state.phase !== 'idle') return state;
      return {
        ...state,
        phase: 'starting',
        seconds: 0,
        levels: [],
        micError: null,
        failedChunks: 0,
        limitReached: false,
      };
    case 'mic-ready':
      return state.phase === 'starting' ? { ...state, phase: 'recording' } : state;
    case 'mic-failed':
      return {
        ...state,
        micError: event.kind,
        phase: state.phase === 'starting' ? 'idle' : state.phase,
      };
    case 'audio':
      if (state.phase !== 'recording') return state;
      return {
        ...state,
        seconds: event.seconds,
        levels: [...state.levels, event.level].slice(-WAVE_BARS),
      };
    case 'limit':
      return { ...state, limitReached: true };
    case 'stop':
      if (state.phase !== 'recording' && state.phase !== 'starting') return state;
      return settle({ ...state, phase: 'finishing' });
    case 'model-loading':
      return { ...state, model: { status: 'loading', percent: event.percent } };
    case 'model-ready':
      return { ...state, model: { status: 'ready', device: event.device } };
    case 'model-failed':
      return { ...state, model: { status: 'failed', message: event.message } };
    case 'chunk-queued':
      return { ...state, pending: state.pending + 1 };
    case 'chunk-done':
      return settle({ ...state, pending: Math.max(0, state.pending - 1) });
    case 'chunk-failed':
      return settle({
        ...state,
        pending: Math.max(0, state.pending - 1),
        failedChunks: state.failedChunks + 1,
      });
    case 'discard':
      return settle({ ...state, pending: 0 });
  }
}

/** 134 segundos viram "02:14"; passando de uma hora, "1:02:14". */
export function formatElapsed(totalSeconds: number): string {
  const total = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pair = (value: number) => String(value).padStart(2, '0');
  return hours > 0
    ? `${hours}:${pair(minutes)}:${pair(seconds)}`
    : `${pair(minutes)}:${pair(seconds)}`;
}

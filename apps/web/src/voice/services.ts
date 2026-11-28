import type { ChunkLimits } from './audio';
import { detectComputeDevice, type ComputeDevice } from './device';
import { createMicRecorder, type AudioRecorder } from './recorder';
import type { Transcriber } from './transcriber';
import { createWorkerTranscriber } from './worker-transcriber';

/** Tudo o que a tela "Falar e organizar" pede de fora; os testes trocam por versões falsas. */
export interface VoiceServices {
  createRecorder: () => AudioRecorder;
  createTranscriber: () => Transcriber;
  detectDevice: () => Promise<ComputeDevice>;
  /** Tamanho dos pedaços de áudio; os testes encurtam. */
  chunkLimits?: ChunkLimits;
}

/**
 * Gancho dos testes de ponta a ponta: o Playwright define `window.__TRAMA_VOICE_TEST__`
 * antes da página carregar, para trocar o Whisper por um transcritor falso (baixar o modelo de
 * verdade a cada teste seria lento e dependeria da internet). Sem isso, nada muda.
 */
export interface VoiceTestHook {
  transcriber?: Transcriber;
  device?: ComputeDevice;
  chunkLimits?: ChunkLimits;
}

declare global {
  interface Window {
    __TRAMA_VOICE_TEST__?: VoiceTestHook;
  }
}

/** O microfone e o Whisper de verdade (a menos que o gancho de teste diga outra coisa). */
export const realVoiceServices: VoiceServices = {
  createRecorder: createMicRecorder,
  createTranscriber: () => window.__TRAMA_VOICE_TEST__?.transcriber ?? createWorkerTranscriber(),
  detectDevice: () => {
    const forced = window.__TRAMA_VOICE_TEST__?.device;
    return forced ? Promise.resolve(forced) : detectComputeDevice();
  },
  get chunkLimits() {
    return window.__TRAMA_VOICE_TEST__?.chunkLimits;
  },
};

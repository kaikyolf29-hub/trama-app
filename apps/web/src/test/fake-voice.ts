import { vi } from 'vitest';
import type { ComputeDevice } from '../voice/device';
import type { MicErrorKind } from '../voice/mic-errors';
import { MicError, type AudioRecorder, type RecorderHandlers } from '../voice/recorder';
import type { VoiceServices } from '../voice/services';
import type { LoadOptions, Transcriber } from '../voice/transcriber';

/** Um microfone de mentira: o teste decide quando chega áudio. */
export function createFakeRecorder() {
  let handlers: RecorderHandlers | null = null;
  let failWith: MicErrorKind | null = null;
  const start = vi.fn((given: RecorderHandlers) => {
    if (failWith) return Promise.reject(new MicError(failWith));
    handlers = given;
    return Promise.resolve();
  });
  const stop = vi.fn(() => {
    handlers = null;
    return Promise.resolve();
  });
  const recorder: AudioRecorder = { start, stop };
  return {
    recorder,
    start,
    stop,
    /** O próximo `start` falha com este motivo. */
    failNextStart(kind: MicErrorKind) {
      failWith = kind;
    },
    clearFailure() {
      failWith = null;
    },
    /** Chega áudio: `seconds` de um tom alto (conta como fala) na taxa dada. */
    speak(seconds: number, rate = 48_000) {
      const samples = new Float32Array(Math.round(seconds * rate));
      for (let i = 0; i < samples.length; i++)
        samples[i] = 0.3 * Math.sin((i / rate) * 2 * Math.PI * 220);
      handlers?.onAudio(samples, rate);
    },
    /** Chega silêncio. */
    stayQuiet(seconds: number, rate = 48_000) {
      handlers?.onAudio(new Float32Array(Math.round(seconds * rate)), rate);
    },
    /** O microfone foi desconectado. */
    unplug() {
      handlers?.onEnded();
    },
  };
}

export interface FakeTranscriberOptions {
  /** O texto de cada pedaço, na ordem; depois do último, repete "texto N". */
  texts?: string[];
  device?: ComputeDevice;
  /** Percentuais de download que `load` anuncia antes de terminar. */
  progress?: number[];
  /** `load` falha com esta mensagem na primeira vez. */
  failLoadOnce?: string;
  /** O pedaço de número N (de 0) falha. */
  failChunk?: number;
}

/** Um Whisper de mentira: devolve textos combinados e anota o que recebeu. */
export function createFakeTranscriber(options: FakeTranscriberOptions = {}) {
  const heard: Float32Array[] = [];
  let failLoad = options.failLoadOnce;
  const load = vi.fn((loadOptions: LoadOptions) => {
    if (failLoad) {
      const message = failLoad;
      failLoad = undefined;
      return Promise.reject(new Error(message));
    }
    for (const percent of options.progress ?? []) loadOptions.onProgress(percent);
    return Promise.resolve({ device: options.device ?? loadOptions.device });
  });
  const transcribe = vi.fn((audio: Float32Array) => {
    const index = heard.length;
    heard.push(audio);
    if (options.failChunk === index) return Promise.reject(new Error('falhou'));
    return Promise.resolve(options.texts?.[index] ?? `texto ${index + 1}`);
  });
  const dispose = vi.fn();
  const transcriber: Transcriber = { load, transcribe, dispose };
  return { transcriber, load, transcribe, dispose, heard };
}

/** Os serviços de voz da tela, todos falsos. */
export function createFakeVoiceServices(
  recorder = createFakeRecorder(),
  transcriber = createFakeTranscriber(),
  device: ComputeDevice = 'webgpu',
) {
  const services: VoiceServices = {
    createRecorder: () => recorder.recorder,
    createTranscriber: () => transcriber.transcriber,
    detectDevice: () => Promise.resolve(device),
  };
  return { services, recorder, transcriber };
}

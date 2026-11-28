import type { ComputeDevice } from './device';
import type { VoiceModelId } from './models';

export interface LoadOptions {
  model: VoiceModelId;
  /** Onde a pessoa tem como rodar; o Transcriber pode cair para `wasm` se `webgpu` falhar. */
  device: ComputeDevice;
  /** 0 a 100 enquanto o modelo baixa; só chega se houver download de verdade. */
  onProgress: (percent: number) => void;
}

/**
 * Quem transforma áudio em texto. A versão real roda o Whisper num Web Worker
 * (`worker-transcriber.ts`); os testes e o Playwright usam uma versão falsa. O áudio nunca
 * sai do computador: só passa daqui para o Worker.
 */
export interface Transcriber {
  /** Prepara o modelo (baixa na primeira vez). Devolve o dispositivo que de fato ficou em uso. */
  load(options: LoadOptions): Promise<{ device: ComputeDevice }>;
  /** Transcreve áudio de 16 kHz mono (até uns 30 s) em português. */
  transcribe(audio: Float32Array): Promise<string>;
  /** Encerra o Worker e solta a memória. */
  dispose(): void;
}

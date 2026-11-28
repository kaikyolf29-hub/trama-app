import type { ComputeDevice } from './device';
import type { VoiceModelId } from './models';

/** Mensagens da página para o Worker do Whisper. Cada pedido leva um `id` para casar a resposta. */
export type WorkerRequest =
  | { type: 'load'; id: number; model: VoiceModelId; device: ComputeDevice }
  | { type: 'transcribe'; id: number; audio: Float32Array };

/** Mensagens do Worker para a página. */
export type WorkerResponse =
  | { type: 'progress'; id: number; percent: number }
  | { type: 'loaded'; id: number; device: ComputeDevice }
  | { type: 'result'; id: number; text: string }
  | { type: 'error'; id: number; message: string };

/**
 * O Transformers.js manda, junto dos avisos por arquivo, um aviso `progress_total` com o
 * total de todos os arquivos do modelo (0 a 100). É o que a tela mostra.
 */
export function percentFromProgress(info: unknown): number | null {
  if (typeof info !== 'object' || info === null) return null;
  const { status, progress } = info as { status?: unknown; progress?: unknown };
  if (status !== 'progress_total' || typeof progress !== 'number' || !Number.isFinite(progress)) {
    return null;
  }
  return Math.min(100, Math.max(0, Math.round(progress)));
}

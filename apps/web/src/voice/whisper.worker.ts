/**
 * Web Worker do Whisper: roda o Transformers.js fora da thread da tela, para ela não travar
 * enquanto o modelo baixa e transcreve. O modelo vem do Hugging Face na primeira vez e fica
 * no cache do navegador (Cache API); o áudio nunca sai do computador.
 */
import { pipeline } from '@huggingface/transformers';
import { VOICE_MODELS } from './models';
import type { ComputeDevice } from './device';
import { percentFromProgress, type WorkerRequest, type WorkerResponse } from './worker-protocol';

// `self` aqui é o escopo do Worker; o tsconfig do site só tem os tipos da página.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse): void;
};

type Recognizer = (
  audio: Float32Array,
  options: Record<string, unknown>,
) => Promise<{ text: string } | { text: string }[]>;

let recognizer: Recognizer | null = null;

async function createRecognizer(
  model: keyof typeof VOICE_MODELS,
  device: ComputeDevice,
  onPercent: (percent: number) => void,
): Promise<Recognizer> {
  const spec = VOICE_MODELS[model];
  const created = await pipeline('automatic-speech-recognition', spec.repo, {
    device,
    // @ts-expect-error o tipo do dtype por parte do modelo é mais estreito que o do exemplo oficial
    dtype: spec.dtype[device],
    progress_callback: (info: unknown) => {
      const percent = percentFromProgress(info);
      if (percent !== null) onPercent(percent);
    },
  });
  const run = created as unknown as Recognizer;
  // Um segundo de silêncio: compila os "shaders" da placa de vídeo agora, e não no meio da fala.
  await run(new Float32Array(16_000), { language: 'portuguese', task: 'transcribe' });
  return run;
}

async function load(request: Extract<WorkerRequest, { type: 'load' }>) {
  const onPercent = (percent: number) =>
    scope.postMessage({ type: 'progress', id: request.id, percent });
  let device = request.device;
  try {
    recognizer = await createRecognizer(request.model, device, onPercent);
  } catch (error) {
    // WebGPU existe mas não funcionou (driver, memória): cai para o processador.
    if (device !== 'webgpu') throw error;
    device = 'wasm';
    recognizer = await createRecognizer(request.model, device, onPercent);
  }
  scope.postMessage({ type: 'loaded', id: request.id, device });
}

async function transcribe(request: Extract<WorkerRequest, { type: 'transcribe' }>) {
  if (!recognizer) throw new Error('O modelo de voz ainda não foi carregado.');
  const output = await recognizer(request.audio, {
    language: 'portuguese',
    task: 'transcribe',
    chunk_length_s: 30,
    return_timestamps: false,
  });
  const text = Array.isArray(output) ? output.map((part) => part.text).join(' ') : output.text;
  scope.postMessage({ type: 'result', id: request.id, text });
}

scope.onmessage = (event) => {
  const request = event.data;
  const work = request.type === 'load' ? load(request) : transcribe(request);
  work.catch((error: unknown) =>
    scope.postMessage({
      type: 'error',
      id: request.id,
      message: error instanceof Error ? error.message : 'Erro desconhecido no Whisper.',
    }),
  );
};

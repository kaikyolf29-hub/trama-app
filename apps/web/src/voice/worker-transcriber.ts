import type { ComputeDevice } from './device';
import type { LoadOptions, Transcriber } from './transcriber';
import type { WorkerRequest, WorkerResponse } from './worker-protocol';

/** O pedaço do `Worker` que usamos (os testes passam um falso no lugar). */
export interface WorkerLike {
  postMessage(message: WorkerRequest, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

interface Waiting {
  resolve: (response: WorkerResponse) => void;
  reject: (error: Error) => void;
  onProgress?: (percent: number) => void;
}

/**
 * O Transcriber de verdade: fala com o Worker do Whisper por mensagens. O Worker só é criado
 * na primeira chamada, então nada disto pesa até a pessoa gravar.
 */
export class WorkerTranscriber implements Transcriber {
  private worker: WorkerLike | null = null;
  private nextId = 1;
  private readonly waiting = new Map<number, Waiting>();

  constructor(private readonly createWorker: () => WorkerLike) {}

  private ensureWorker(): WorkerLike {
    if (this.worker) return this.worker;
    const worker = this.createWorker();
    worker.onmessage = (event) => this.receive(event.data);
    worker.onerror = (event) =>
      this.failAll(new Error(event.message || 'O Worker do Whisper parou de responder.'));
    this.worker = worker;
    return worker;
  }

  private receive(response: WorkerResponse) {
    const waiting = this.waiting.get(response.id);
    if (!waiting) return;
    if (response.type === 'progress') {
      waiting.onProgress?.(response.percent);
      return;
    }
    this.waiting.delete(response.id);
    if (response.type === 'error') waiting.reject(new Error(response.message));
    else waiting.resolve(response);
  }

  private failAll(error: Error) {
    for (const waiting of this.waiting.values()) waiting.reject(error);
    this.waiting.clear();
  }

  private request(
    build: (id: number) => WorkerRequest,
    options: { transfer?: Transferable[]; onProgress?: (percent: number) => void } = {},
  ): Promise<WorkerResponse> {
    const worker = this.ensureWorker();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject, onProgress: options.onProgress });
      worker.postMessage(build(id), options.transfer);
    });
  }

  async load({ model, device, onProgress }: LoadOptions): Promise<{ device: ComputeDevice }> {
    const response = await this.request((id) => ({ type: 'load', id, model, device }), {
      onProgress,
    });
    if (response.type !== 'loaded') throw new Error('Resposta inesperada do Worker.');
    return { device: response.device };
  }

  async transcribe(audio: Float32Array): Promise<string> {
    // Cópia: o buffer vai para o Worker (transferido) e some daqui.
    const copy = audio.slice();
    const response = await this.request((id) => ({ type: 'transcribe', id, audio: copy }), {
      transfer: [copy.buffer],
    });
    if (response.type !== 'result') throw new Error('Resposta inesperada do Worker.');
    return response.text;
  }

  dispose(): void {
    this.failAll(new Error('Transcrição cancelada.'));
    this.worker?.terminate();
    this.worker = null;
  }
}

/** O Worker do Whisper: um arquivo à parte, que o Vite empacota com o Transformers.js. */
export function createWhisperWorker(): WorkerLike {
  return new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' });
}

export function createWorkerTranscriber(): Transcriber {
  return new WorkerTranscriber(createWhisperWorker);
}

import {
  ChunkBuffer,
  DEFAULT_CHUNK_LIMITS,
  hasSpeech,
  levelOf,
  StreamResampler,
  WHISPER_SAMPLE_RATE,
  type ChunkLimits,
} from './audio';
import type { ComputeDevice } from './device';
import { MicError, type AudioRecorder } from './recorder';
import {
  initialVoiceState,
  MAX_RECORDING_SECONDS,
  voiceReducer,
  type VoiceEvent,
  type VoiceState,
} from './recording-state';
import type { VoiceModelId } from './models';
import { cleanChunkText } from './text';
import type { Transcriber } from './transcriber';

export interface VoiceSessionOptions {
  recorder: AudioRecorder;
  transcriber: Transcriber;
  model: VoiceModelId;
  device: ComputeDevice;
  /** Chega um pedaço de texto já limpo, na ordem em que foi falado. */
  onText: (text: string) => void;
  chunkLimits?: ChunkLimits;
  maxSeconds?: number;
}

/** Trechos com menos de meio segundo de áudio não valem o Whisper (ele inventa texto). */
const MIN_CHUNK_SAMPLES = WHISPER_SAMPLE_RATE / 2;

/**
 * Junta tudo: pega o áudio do microfone, reamostra para 16 kHz, corta em pedaços nos silêncios
 * e manda cada pedaço, um por vez, para o Transcriber. O modelo começa a carregar assim que o
 * microfone é liberado, enquanto a pessoa já fala. Sem React: a tela só assina o estado.
 */
export class VoiceSession {
  private state: VoiceState = initialVoiceState;
  private readonly listeners = new Set<() => void>();
  private resampler: StreamResampler | null = null;
  private chunks: ChunkBuffer;
  private samplesIn = 0;
  private queue: Float32Array[] = [];
  private pumping = false;
  private loaded: Promise<void> | null = null;
  private disposed = false;

  constructor(private readonly options: VoiceSessionOptions) {
    this.chunks = new ChunkBuffer(options.chunkLimits ?? DEFAULT_CHUNK_LIMITS);
  }

  // --- estado, para useSyncExternalStore ---
  getState = (): VoiceState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private dispatch(event: VoiceEvent) {
    if (this.disposed) return;
    const next = voiceReducer(this.state, event);
    if (next === this.state) return;
    this.state = next;
    this.listeners.forEach((listener) => listener());
  }

  // --- gravação ---

  /** Pede o microfone e começa a gravar. Não lança: os erros viram estado. */
  async start(): Promise<void> {
    if (this.state.phase !== 'idle') return;
    this.dispatch({ type: 'start' });
    this.resampler = null;
    this.chunks = new ChunkBuffer(this.options.chunkLimits ?? DEFAULT_CHUNK_LIMITS);
    this.samplesIn = 0;
    try {
      await this.options.recorder.start({
        onAudio: (samples, rate) => this.handleAudio(samples, rate),
        onEnded: () => void this.handleMicLost(),
      });
    } catch (error) {
      this.dispatch({
        type: 'mic-failed',
        kind: error instanceof MicError ? error.kind : 'unknown',
      });
      return;
    }
    this.dispatch({ type: 'mic-ready' });
    // O modelo carrega junto com a fala: quando o primeiro pedaço fechar, ele já pode estar pronto.
    void this.ensureModel().catch(() => undefined);
  }

  /** Para de gravar e manda o que sobrou para a transcrição. */
  async stop(): Promise<void> {
    if (this.state.phase !== 'recording' && this.state.phase !== 'starting') return;
    await this.options.recorder.stop();
    const rest = this.chunks.flush();
    if (rest) this.enqueue(rest);
    this.dispatch({ type: 'stop' });
    void this.pump();
  }

  private async handleMicLost() {
    await this.stop();
    this.dispatch({ type: 'mic-failed', kind: 'lost' });
  }

  private handleAudio(samples: Float32Array, rate: number) {
    if (this.state.phase !== 'recording' && this.state.phase !== 'starting') return;
    this.resampler ??= new StreamResampler(rate);
    const resampled = this.resampler.process(samples);
    this.samplesIn += resampled.length;
    for (const chunk of this.chunks.push(resampled)) this.enqueue(chunk);
    this.dispatch({
      type: 'audio',
      seconds: this.samplesIn / WHISPER_SAMPLE_RATE,
      level: levelOf(samples),
    });
    if (
      this.samplesIn / WHISPER_SAMPLE_RATE >=
      (this.options.maxSeconds ?? MAX_RECORDING_SECONDS)
    ) {
      this.dispatch({ type: 'limit' });
      void this.stop();
    }
  }

  // --- modelo e fila de transcrição ---

  private enqueue(chunk: Float32Array) {
    // Pedaço curto demais ou sem fala não vai para o Whisper.
    if (chunk.length < MIN_CHUNK_SAMPLES || !hasSpeech(chunk)) return;
    this.queue.push(chunk);
    this.dispatch({ type: 'chunk-queued' });
    void this.pump();
  }

  private ensureModel(): Promise<void> {
    if (this.loaded) return this.loaded;
    this.dispatch({ type: 'model-loading', percent: null });
    const attempt = this.options.transcriber
      .load({
        model: this.options.model,
        device: this.options.device,
        onProgress: (percent) => this.dispatch({ type: 'model-loading', percent }),
      })
      .then(({ device }) => this.dispatch({ type: 'model-ready', device }))
      .catch((error: unknown) => {
        this.loaded = null;
        this.dispatch({
          type: 'model-failed',
          message: error instanceof Error && error.message ? error.message : 'Falha ao carregar.',
        });
        throw error;
      });
    this.loaded = attempt;
    return attempt;
  }

  /** Transcreve a fila, um pedaço por vez. Para se o modelo não carregar (e `retryModel` retoma). */
  private async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.queue.length > 0 && !this.disposed) {
        // Depois de uma falha, só "Tentar de novo" (ou uma nova gravação) carrega outra vez.
        if (this.state.model.status === 'failed') return;
        try {
          await this.ensureModel();
        } catch {
          return;
        }
        const chunk = this.queue.shift();
        if (!chunk) break;
        try {
          const text = cleanChunkText(await this.options.transcriber.transcribe(chunk));
          if (text && !this.disposed) this.options.onText(text);
          this.dispatch({ type: 'chunk-done' });
        } catch {
          this.dispatch({ type: 'chunk-failed' });
        }
      }
    } finally {
      this.pumping = false;
    }
  }

  /** Tenta carregar o modelo de novo depois de uma falha (os trechos esperando seguem na fila). */
  retryModel(): void {
    if (this.state.model.status !== 'failed') return;
    void this.ensureModel().then(
      () => this.pump(),
      () => undefined,
    );
  }

  /** Desiste dos trechos que ainda não foram transcritos. */
  discard(): void {
    this.queue = [];
    this.dispatch({ type: 'discard' });
  }

  dispose(): void {
    if (this.state.phase === 'recording' || this.state.phase === 'starting') {
      void this.options.recorder.stop().catch(() => undefined);
    }
    this.disposed = true;
    this.queue = [];
    this.listeners.clear();
    this.options.transcriber.dispose();
  }
}

import { classifyMicError, type MicErrorKind } from './mic-errors';

/** Erro do microfone já traduzido: `kind` diz o que mostrar para a pessoa. */
export class MicError extends Error {
  constructor(readonly kind: MicErrorKind) {
    super(kind);
    this.name = 'MicError';
  }
}

export interface RecorderHandlers {
  /** Áudio mono na taxa nativa do dispositivo (em geral 48 kHz), pedaço a pedaço. */
  onAudio: (samples: Float32Array, sampleRate: number) => void;
  /** O microfone parou por conta própria (foi desligado ou desconectado). */
  onEnded: () => void;
}

/**
 * Quem capta o áudio. A versão real usa o microfone (`createMicRecorder`); os testes usam
 * uma que entrega amostras escritas à mão.
 */
export interface AudioRecorder {
  /** Pede o microfone e começa a entregar áudio. Rejeita com `MicError`. */
  start(handlers: RecorderHandlers): Promise<void>;
  /** Para, entrega o que faltava e solta o microfone. */
  stop(): Promise<void>;
}

// O código do AudioWorklet vai como texto e sobe por um Blob: assim não depende de onde o
// site está hospedado. Junta 4096 amostras antes de avisar a tela (uns 85 ms a 48 kHz).
const WORKLET_SOURCE = `
class TramaCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.parts = [];
    this.count = 0;
    this.port.onmessage = (event) => {
      if (event.data === 'flush') {
        this.send();
        this.port.postMessage('flushed');
      }
    };
  }
  send() {
    if (this.count === 0) return;
    const out = new Float32Array(this.count);
    let at = 0;
    for (const part of this.parts) { out.set(part, at); at += part.length; }
    this.parts = [];
    this.count = 0;
    this.port.postMessage(out, [out.buffer]);
  }
  process(inputs) {
    const channels = inputs[0];
    if (channels && channels.length > 0) {
      const mono = new Float32Array(channels[0].length);
      for (const channel of channels) {
        for (let i = 0; i < mono.length; i++) mono[i] += channel[i] / channels.length;
      }
      this.parts.push(mono);
      this.count += mono.length;
      if (this.count >= 4096) this.send();
    }
    return true;
  }
}
registerProcessor('trama-capture', TramaCapture);
`;

/** O microfone de verdade: `getUserMedia` + um AudioWorklet que entrega os números do áudio. */
export function createMicRecorder(): AudioRecorder {
  let stream: MediaStream | null = null;
  let context: AudioContext | null = null;
  let node: AudioWorkletNode | null = null;
  let active = false;
  let onFlushed: (() => void) | null = null;

  const release = async () => {
    active = false;
    node?.disconnect();
    node = null;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    const closing = context;
    context = null;
    if (closing && closing.state !== 'closed') await closing.close().catch(() => undefined);
  };

  return {
    async start(handlers) {
      if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === 'undefined') {
        throw new MicError('unsupported');
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        context = new AudioContext();
        const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'text/javascript' }));
        try {
          await context.audioWorklet.addModule(url);
        } finally {
          URL.revokeObjectURL(url);
        }
        node = new AudioWorkletNode(context, 'trama-capture', { numberOfOutputs: 0 });
        const rate = context.sampleRate;
        node.port.onmessage = (event: MessageEvent<Float32Array | string>) => {
          if (event.data === 'flushed') onFlushed?.();
          else if (event.data instanceof Float32Array && active) handlers.onAudio(event.data, rate);
        };
        context.createMediaStreamSource(stream).connect(node);
        // Alguns navegadores deixam o contexto "suspended" até um gesto: o clique já foi um.
        if (context.state === 'suspended') await context.resume();
        stream.getAudioTracks().forEach((track) => {
          track.onended = () => {
            if (active) handlers.onEnded();
          };
        });
        active = true;
      } catch (error) {
        await release();
        throw new MicError(error instanceof MicError ? error.kind : classifyMicError(error));
      }
    },

    async stop() {
      const port = node?.port;
      if (port && active) {
        // Pede o que ainda está no buffer do worklet e espera a resposta (no máximo 500 ms).
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 500);
          onFlushed = () => {
            clearTimeout(timer);
            resolve();
          };
          port.postMessage('flush');
        });
        onFlushed = null;
      }
      await release();
    },
  };
}

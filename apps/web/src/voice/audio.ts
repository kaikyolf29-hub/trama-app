/**
 * Áudio para o Whisper: reamostrar para 16 kHz mono, cortar a gravação em pedaços nos
 * silêncios e medir o volume. Só funções puras e classes sem navegador, para testar no Vitest.
 */

/** O Whisper só entende áudio a 16 kHz, um canal, em números de -1 a 1. */
export const WHISPER_SAMPLE_RATE = 16_000;

/**
 * Reamostra um fluxo de áudio mono, pedaço a pedaço, para `toRate`. Cada amostra de saída é
 * a média da faixa de entrada que ela cobre (com peso nas bordas fracionárias): serve de
 * filtro contra distorção ao baixar de 48 kHz ou 44,1 kHz para 16 kHz. A sobra de cada pedaço
 * espera o próximo, então o resultado não depende de como o áudio foi dividido.
 */
export class StreamResampler {
  private pending: Float32Array = new Float32Array(0);
  /** Onde, dentro de `pending`, começa a próxima amostra de saída (fracionário). */
  private offset = 0;
  private readonly ratio: number;

  constructor(
    readonly fromRate: number,
    readonly toRate: number = WHISPER_SAMPLE_RATE,
  ) {
    if (!(fromRate > 0) || !(toRate > 0)) throw new Error('Taxa de amostragem inválida.');
    this.ratio = fromRate / toRate;
  }

  process(input: Float32Array): Float32Array {
    if (this.ratio === 1) return input;
    const buffer = new Float32Array(this.pending.length + input.length);
    buffer.set(this.pending);
    buffer.set(input, this.pending.length);

    const out = new Float32Array(Math.max(0, Math.floor((buffer.length - this.offset) / this.ratio)));
    let written = 0;
    let start = this.offset;
    while (written < out.length) {
      const end = start + this.ratio;
      if (end > buffer.length) break;
      let sum = 0;
      for (let i = Math.floor(start); i < Math.ceil(end); i++) {
        sum += (buffer[i] ?? 0) * (Math.min(i + 1, end) - Math.max(i, start));
      }
      out[written++] = sum / this.ratio;
      start = this.offset + written * this.ratio;
    }

    const consumed = Math.floor(start);
    this.pending = buffer.slice(consumed);
    this.offset = start - consumed;
    return written === out.length ? out : out.slice(0, written);
  }
}

/** Reamostra uma gravação inteira de uma vez. */
export function resampleMono(
  input: Float32Array,
  fromRate: number,
  toRate: number = WHISPER_SAMPLE_RATE,
): Float32Array {
  return new StreamResampler(fromRate, toRate).process(input);
}

/** Valor eficaz (RMS) das amostras: 0 é silêncio, 1 é o volume máximo. */
export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}

/** Nível de 0 a 1 para as barras da tela (a raiz deixa a fala normal bem visível). */
export function levelOf(samples: Float32Array): number {
  return Math.min(1, Math.sqrt(rms(samples)) * 2);
}

/** Abaixo disso (RMS), uma janela de 100 ms é só ruído de fundo. */
const SPEECH_RMS = 0.005;

/**
 * Tem alguma fala neste trecho? Pedaços sem fala não vão para o Whisper: com silêncio ele
 * costuma inventar frases.
 */
export function hasSpeech(samples: Float32Array, sampleRate = WHISPER_SAMPLE_RATE): boolean {
  const window = Math.max(1, Math.round(sampleRate / 10));
  for (let start = 0; start < samples.length; start += window) {
    if (rms(samples.subarray(start, start + window)) >= SPEECH_RMS) return true;
  }
  return false;
}

/**
 * Onde cortar `samples` entre `from` e `to` (índices): no ponto mais quieto, para não partir
 * uma palavra ao meio. Compara janelas de 200 ms andando de 50 em 50 ms e devolve o meio da
 * mais silenciosa (a mais tardia, se empatar).
 */
export function findQuietCut(
  samples: Float32Array,
  from: number,
  to: number,
  sampleRate = WHISPER_SAMPLE_RATE,
): number {
  const end = Math.min(to, samples.length);
  const window = Math.round(sampleRate * 0.2);
  const step = Math.round(sampleRate * 0.05);
  if (end - from <= window) return end;

  // Soma acumulada dos quadrados: a energia de qualquer janela sai de duas contas.
  const energy = new Float64Array(end - from + 1);
  for (let i = from; i < end; i++) {
    const value = samples[i] ?? 0;
    energy[i - from + 1] = (energy[i - from] ?? 0) + value * value;
  }
  let best = end;
  let bestEnergy = Infinity;
  for (let start = 0; start + window <= end - from; start += step) {
    const total = (energy[start + window] ?? 0) - (energy[start] ?? 0);
    if (total <= bestEnergy) {
      bestEnergy = total;
      best = from + start + Math.round(window / 2);
    }
  }
  return best;
}

export interface ChunkLimits {
  /** O pedaço só fecha depois disto (segundos). */
  minSeconds: number;
  /** Nunca passa disto (segundos): o Whisper lê até 30 s de uma vez. */
  maxSeconds: number;
}

/** Pedaços de 12 a 20 s: o texto aparece a cada pouco, e o Whisper vê frases inteiras. */
export const DEFAULT_CHUNK_LIMITS: ChunkLimits = { minSeconds: 12, maxSeconds: 20 };

/**
 * Junta o áudio de 16 kHz que chega e entrega pedaços de 12 a 20 s, cortados no ponto mais
 * quieto. Ao parar, `flush` entrega o que sobrou.
 */
export class ChunkBuffer {
  private samples: Float32Array = new Float32Array(0);

  constructor(private readonly limits: ChunkLimits = DEFAULT_CHUNK_LIMITS) {}

  /** Quantas amostras esperam por um corte. */
  get size(): number {
    return this.samples.length;
  }

  push(incoming: Float32Array): Float32Array[] {
    if (incoming.length > 0) {
      const merged = new Float32Array(this.samples.length + incoming.length);
      merged.set(this.samples);
      merged.set(incoming, this.samples.length);
      this.samples = merged;
    }
    const chunks: Float32Array[] = [];
    const max = Math.round(this.limits.maxSeconds * WHISPER_SAMPLE_RATE);
    const min = Math.round(this.limits.minSeconds * WHISPER_SAMPLE_RATE);
    while (this.samples.length >= max) {
      const cut = findQuietCut(this.samples, min, max);
      chunks.push(this.samples.slice(0, cut));
      this.samples = this.samples.slice(cut);
    }
    return chunks;
  }

  /** O resto, qualquer que seja o tamanho; null se não sobrou nada. */
  flush(): Float32Array | null {
    if (this.samples.length === 0) return null;
    const rest = this.samples;
    this.samples = new Float32Array(0);
    return rest;
  }
}

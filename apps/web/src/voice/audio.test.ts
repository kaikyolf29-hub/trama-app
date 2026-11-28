import { describe, expect, it } from 'vitest';
import {
  ChunkBuffer,
  findQuietCut,
  hasSpeech,
  levelOf,
  resampleMono,
  rms,
  StreamResampler,
  WHISPER_SAMPLE_RATE,
} from './audio';

function tone(seconds: number, rate: number, hz = 440, amplitude = 0.5) {
  const out = new Float32Array(Math.round(seconds * rate));
  for (let i = 0; i < out.length; i++) out[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / rate);
  return out;
}

describe('reamostragem para 16 kHz', () => {
  it('48 kHz vira 16 kHz com o tamanho certo e o mesmo volume', () => {
    const out = resampleMono(tone(1, 48_000), 48_000);
    expect(out.length).toBe(16_000);
    expect(rms(out)).toBeCloseTo(rms(tone(1, 16_000)), 1);
  });

  it('44,1 kHz (taxa que não divide) também sai com a duração certa', () => {
    const out = resampleMono(tone(2, 44_100), 44_100);
    expect(Math.abs(out.length - 32_000)).toBeLessThanOrEqual(1);
  });

  it('um sinal constante continua constante', () => {
    const out = resampleMono(new Float32Array(4800).fill(0.25), 48_000);
    expect(out.length).toBe(1600);
    for (const sample of out) expect(sample).toBeCloseTo(0.25, 6);
  });

  it('a taxa que já é 16 kHz passa direto', () => {
    const input = tone(0.1, 16_000);
    expect(resampleMono(input, 16_000)).toBe(input);
  });

  it('o resultado não depende de como o áudio chegou em pedaços', () => {
    const input = tone(1.5, 44_100, 300);
    const whole = resampleMono(input, 44_100);
    const stream = new StreamResampler(44_100);
    const parts: Float32Array[] = [];
    for (let at = 0; at < input.length; at += 1_337) {
      parts.push(stream.process(input.subarray(at, at + 1_337)));
    }
    const joined = new Float32Array(parts.reduce((total, part) => total + part.length, 0));
    let offset = 0;
    for (const part of parts) {
      joined.set(part, offset);
      offset += part.length;
    }
    expect(joined.length).toBe(whole.length);
    for (let i = 0; i < whole.length; i += 97) expect(joined[i]).toBeCloseTo(whole[i] ?? 0, 5);
  });

  it('recusa taxa inválida', () => {
    expect(() => new StreamResampler(0)).toThrow();
  });
});

describe('volume e fala', () => {
  it('rms de silêncio é 0 e o nível sobe com o volume', () => {
    expect(rms(new Float32Array(100))).toBe(0);
    expect(levelOf(new Float32Array(100))).toBe(0);
    expect(levelOf(tone(0.1, 16_000, 440, 0.4))).toBeGreaterThan(
      levelOf(tone(0.1, 16_000, 440, 0.01)),
    );
    expect(levelOf(tone(0.1, 16_000, 440, 1))).toBeLessThanOrEqual(1);
  });

  it('só trata como fala o que passa do ruído de fundo', () => {
    expect(hasSpeech(new Float32Array(16_000))).toBe(false);
    expect(hasSpeech(tone(1, 16_000, 440, 0.001))).toBe(false);
    expect(hasSpeech(tone(1, 16_000, 440, 0.2))).toBe(true);
    const mostlyQuiet = new Float32Array(32_000);
    mostlyQuiet.set(tone(0.3, 16_000, 440, 0.2), 20_000);
    expect(hasSpeech(mostlyQuiet)).toBe(true);
  });
});

describe('corte no ponto mais quieto', () => {
  it('corta no meio do silêncio, e não no meio da fala', () => {
    const rate = WHISPER_SAMPLE_RATE;
    const samples = tone(20, rate, 200, 0.4);
    // Uma pausa de 1 s no segundo 15.
    samples.fill(0, 15 * rate, 16 * rate);
    const cut = findQuietCut(samples, 12 * rate, 20 * rate);
    expect(cut).toBeGreaterThan(15 * rate);
    expect(cut).toBeLessThan(16 * rate);
  });

  it('sem espaço para uma janela, corta no fim', () => {
    expect(findQuietCut(new Float32Array(1_000), 0, 1_000)).toBe(1_000);
  });

  it('nunca passa dos limites pedidos', () => {
    const rate = WHISPER_SAMPLE_RATE;
    const cut = findQuietCut(tone(30, rate), 12 * rate, 20 * rate);
    expect(cut).toBeGreaterThanOrEqual(12 * rate);
    expect(cut).toBeLessThanOrEqual(20 * rate);
  });
});

describe('pedaços da gravação', () => {
  const rate = WHISPER_SAMPLE_RATE;

  it('não fecha pedaço antes do máximo e entrega o resto no flush', () => {
    const buffer = new ChunkBuffer({ minSeconds: 12, maxSeconds: 20 });
    expect(buffer.push(tone(10, rate))).toEqual([]);
    expect(buffer.push(tone(9, rate))).toEqual([]);
    expect(buffer.flush()?.length).toBe(19 * rate);
    expect(buffer.flush()).toBeNull();
  });

  it('fecha um pedaço de 12 a 20 s quando passa de 20 s e guarda o que sobra', () => {
    const buffer = new ChunkBuffer({ minSeconds: 12, maxSeconds: 20 });
    const chunks = buffer.push(tone(25, rate));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.length).toBeGreaterThanOrEqual(12 * rate);
    expect(chunks[0]!.length).toBeLessThanOrEqual(20 * rate);
    expect(chunks[0]!.length + buffer.size).toBe(25 * rate);
  });

  it('uma gravação longa vira vários pedaços e nenhum áudio se perde', () => {
    const buffer = new ChunkBuffer({ minSeconds: 12, maxSeconds: 20 });
    let total = 0;
    let pieces = 0;
    // 3 minutos chegando de 1 em 1 s.
    for (let second = 0; second < 180; second++) {
      for (const chunk of buffer.push(tone(1, rate))) {
        expect(chunk.length).toBeLessThanOrEqual(20 * rate);
        total += chunk.length;
        pieces++;
      }
    }
    total += buffer.flush()?.length ?? 0;
    expect(total).toBe(180 * rate);
    expect(pieces).toBeGreaterThanOrEqual(9);
  });
});

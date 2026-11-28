import type { Page } from '@playwright/test';

/** Quadros por segundo medidos com `requestAnimationFrame` durante uma interação. */
export interface FrameStats {
  /** Quadros desenhados no intervalo. */
  frames: number;
  /** Duração do intervalo medido, em ms. */
  durationMs: number;
  /** Média: quadros desenhados dividido pelo tempo. */
  avgFps: number;
  /** Os 5% piores quadros, em quadros por segundo (a cauda lenta). */
  p5Fps: number;
  /** O quadro mais demorado, em ms. */
  worstFrameMs: number;
  /** Quantos quadros demoraram mais que 50 ms (menos de 20 fps naquele instante). */
  longFrames: number;
}

/** Começa a contar quadros na página (`requestAnimationFrame` em laço). */
export async function startFrameCounter(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __raf: number };
    w.__frames = [];
    const loop = (time: number) => {
      w.__frames.push(time);
      w.__raf = requestAnimationFrame(loop);
    };
    w.__raf = requestAnimationFrame(loop);
  });
}

/** Para de contar e devolve as estatísticas dos quadros desde `startFrameCounter`. */
export async function stopFrameCounter(page: Page): Promise<FrameStats> {
  return page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __raf: number };
    cancelAnimationFrame(w.__raf);
    const times = w.__frames;
    const gaps = times.slice(1).map((time, index) => time - (times[index] ?? time));
    const durationMs = times.length > 1 ? (times.at(-1) ?? 0) - (times[0] ?? 0) : 0;
    const sorted = [...gaps].sort((a, b) => b - a);
    // Os 5% quadros mais demorados: a média deles diz como é o pior momento.
    const tail = sorted.slice(0, Math.max(1, Math.ceil(sorted.length * 0.05)));
    const tailMs = tail.reduce((sum, gap) => sum + gap, 0) / tail.length;
    return {
      frames: gaps.length,
      durationMs,
      avgFps: durationMs > 0 ? (gaps.length / durationMs) * 1000 : 0,
      p5Fps: tailMs > 0 ? 1000 / tailMs : 0,
      worstFrameMs: sorted[0] ?? 0,
      longFrames: gaps.filter((gap) => gap > 50).length,
    };
  });
}

/** Arredonda para mostrar no relatório. */
export const round = (value: number, digits = 1) => Number(value.toFixed(digits));

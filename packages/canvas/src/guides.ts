/** Retângulo no quadro, em coordenadas absolutas. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Guides {
  /** Canto de cima à esquerda corrigido para alinhar (só nos eixos que alinharam). */
  x?: number;
  y?: number;
  /** Linhas para desenhar: x das verticais e y das horizontais. */
  vertical: number[];
  horizontal: number[];
}

const GRID = 8;

/** Bordas e meio de um retângulo num eixo. */
function stops(start: number, size: number): number[] {
  return [start, start + size / 2, start + size];
}

/**
 * Guias de alinhamento ao arrastar: procura, em cada eixo, a borda ou o meio de outro bloco
 * mais perto de uma borda ou do meio do bloco arrastado, dentro do limite. Só vale o encaixe
 * que deixa o bloco na grade de 8 px, para o quadro nunca sair dela.
 */
export function alignmentGuides(moving: Rect, others: readonly Rect[], threshold: number): Guides {
  const axis = (start: number, size: number, other: (rect: Rect) => [number, number]) => {
    let best: { shift: number; line: number } | undefined;
    const mine = stops(start, size);
    for (const rect of others) {
      for (const target of stops(...other(rect))) {
        for (const point of mine) {
          const shift = target - point;
          if (Math.abs(shift) > threshold || (start + shift) % GRID !== 0) continue;
          if (!best || Math.abs(shift) < Math.abs(best.shift)) best = { shift, line: target };
        }
      }
    }
    return best;
  };

  const vertical = axis(moving.x, moving.width, (rect) => [rect.x, rect.width]);
  const horizontal = axis(moving.y, moving.height, (rect) => [rect.y, rect.height]);
  const x = vertical ? moving.x + vertical.shift : undefined;
  const y = horizontal ? moving.y + horizontal.shift : undefined;

  // Depois do encaixe, mostra toda linha que de fato ficou alinhada (podem ser várias).
  const placed = { ...moving, x: x ?? moving.x, y: y ?? moving.y };
  const lines = (start: number, size: number, other: (rect: Rect) => [number, number]) => {
    const mine = stops(start, size);
    const found = new Set<number>();
    for (const rect of others) {
      for (const target of stops(...other(rect))) {
        if (mine.some((point) => Math.abs(point - target) < 0.5)) found.add(target);
      }
    }
    return [...found];
  };

  return {
    ...(x !== undefined ? { x } : {}),
    ...(y !== undefined ? { y } : {}),
    vertical: vertical ? lines(placed.x, placed.width, (rect) => [rect.x, rect.width]) : [],
    horizontal: horizontal ? lines(placed.y, placed.height, (rect) => [rect.y, rect.height]) : [],
  };
}

/** Um ponto na tela (px, relativo à área de apresentação). */
export interface PenPoint {
  x: number;
  y: number;
}

/** Um traço da caneta: os pontos por onde o ponteiro passou. */
export type PenStroke = readonly PenPoint[];

/** Distância mínima (px) entre dois pontos do traço: o resto é ruído e pesa à toa. */
export const MIN_POINT_GAP = 2;

/** Junta o ponto ao traço, ignorando o que quase não saiu do lugar. */
export function extendStroke(stroke: PenStroke, point: PenPoint): PenStroke {
  const last = stroke.at(-1);
  if (last && Math.hypot(point.x - last.x, point.y - last.y) < MIN_POINT_GAP) return stroke;
  return [...stroke, point];
}

const round = (value: number) => Math.round(value * 10) / 10;

/**
 * O traço como caminho de SVG, suavizado com curvas pelo meio de cada par de pontos.
 * Um ponto só vira um pontinho (linha de comprimento zero com ponta redonda).
 */
export function strokePath(stroke: PenStroke): string {
  const [first, ...rest] = stroke;
  if (!first) return '';
  if (rest.length === 0) return `M ${round(first.x)} ${round(first.y)} l 0 0`;
  let path = `M ${round(first.x)} ${round(first.y)}`;
  let previous = first;
  rest.forEach((point, index) => {
    const mid = { x: (previous.x + point.x) / 2, y: (previous.y + point.y) / 2 };
    // O primeiro segmento sai reto do ponto inicial; os outros curvam até o meio do par.
    path +=
      index === 0
        ? ` L ${round(mid.x)} ${round(mid.y)}`
        : ` Q ${round(previous.x)} ${round(previous.y)} ${round(mid.x)} ${round(mid.y)}`;
    previous = point;
  });
  return `${path} L ${round(previous.x)} ${round(previous.y)}`;
}

import { anchorSideSchema, type AnchorSide, type Arrow } from '@trama/core';

/** Uma seta só liga dois nós diferentes, e não repete uma ligação que já existe (nos dois sentidos). */
export function canConnect(arrows: readonly Arrow[], source: string, target: string): boolean {
  if (!source || !target || source === target) return false;
  return !arrows.some(
    (arrow) =>
      (arrow.from.nodeId === source && arrow.to.nodeId === target) ||
      (arrow.from.nodeId === target && arrow.to.nodeId === source),
  );
}

/** O id do ponto de conexão é o lado da borda (nodes.tsx); outro valor fica sem lado. */
export function sideOf(handle: string | null | undefined): { side?: AnchorSide } {
  const parsed = anchorSideSchema.safeParse(handle);
  return parsed.success ? { side: parsed.data } : {};
}

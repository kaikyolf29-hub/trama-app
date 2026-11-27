/**
 * O "Ajustar" e o ajuste ao abrir o quadro. Deixa espaço para as barras flutuantes (ferramentas
 * à esquerda, título em cima, zoom embaixo) e nunca passa de 100% de zoom: com um bloco só, o
 * quadro abre no tamanho real em vez de gigante.
 */
export const FIT_VIEW = {
  padding: { top: '88px', right: '48px', bottom: '72px', left: '96px' },
  maxZoom: 1,
  duration: 150,
} as const;

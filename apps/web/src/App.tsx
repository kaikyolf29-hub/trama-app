import { DesignPreview } from './DesignPreview';

/**
 * Casca do site. As telas chegam nas próximas etapas (docs/PLAN.md, "Roadmap"). Até o
 * roteador entrar (etapa 0.5), #design abre a vitrine dos componentes base.
 */
export function App() {
  if (typeof window !== 'undefined' && window.location.hash === '#design') {
    return <DesignPreview />;
  }
  return (
    <main className="bg-canvas-dots grid min-h-dvh place-items-center px-4">
      <h1 className="font-serif text-3xl font-semibold text-text-strong">Trama</h1>
    </main>
  );
}

import { FlowCanvas } from '@trama/canvas';
import { flowContentSchema } from '@trama/core';
import { videoFlowExample } from '@trama/core/fixtures';
import { useMemo } from 'react';
import { BoardTitle, PresentButton } from './BoardChrome';

/**
 * O fluxo de vídeo da tela 1 no quadro de verdade, sem login. Serve para ver e testar o quadro
 * (e o preview de cada PR) sem conta.
 */
export function ExampleBoardPage() {
  const flow = useMemo(() => flowContentSchema.parse(videoFlowExample), []);
  return (
    <div className="h-dvh w-full">
      <FlowCanvas
        flow={flow}
        topLeft={<BoardTitle section="Exemplo" title="Como editar 10x mais rápido" />}
        topRight={<PresentButton />}
      />
    </div>
  );
}

import { Link } from '@tanstack/react-router';
import { FlowCanvas } from '@trama/canvas';
import { flowContentSchema } from '@trama/core';
import { videoFlowExample } from '@trama/core/fixtures';
import { Button, LogoMark } from '@trama/ui';
import { PlayIcon } from '@trama/ui/icons';
import { useMemo } from 'react';

const panel =
  'flex h-11 items-center rounded-block border border-border bg-floating shadow-floating';

/**
 * O fluxo de vídeo da tela 1 no quadro de verdade. Serve para ver e testar o quadro até
 * os projetos da pessoa chegarem (etapa 1.5).
 */
export function ExampleBoardPage() {
  const flow = useMemo(() => flowContentSchema.parse(videoFlowExample), []);
  return (
    <div className="h-dvh w-full">
      <FlowCanvas
        flow={flow}
        topLeft={
          <div className={`${panel} gap-2.5 pr-4 pl-2.5 text-sm`}>
            <Link
              to="/"
              aria-label="Trama, página inicial"
              className="rounded-tag focus-visible:outline-2 focus-visible:outline-selection"
            >
              <LogoMark size={26} />
            </Link>
            <span className="font-semibold text-text-strong">Trama</span>
            <span className="h-4.5 w-px bg-border" aria-hidden />
            <span className="text-text-muted">Exemplo</span>
            <span className="text-text-muted" aria-hidden>
              /
            </span>
            <h1 className="truncate font-normal text-text-strong">Como editar 10x mais rápido</h1>
          </div>
        }
        topRight={
          <div className={`${panel} px-1.5`}>
            <Button disabled title="Em breve: modo aula" className="gap-1.5">
              <PlayIcon size={12} aria-hidden fill="currentColor" />
              Apresentar
            </Button>
          </div>
        }
      />
    </div>
  );
}

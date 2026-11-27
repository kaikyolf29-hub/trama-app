import { Link } from '@tanstack/react-router';
import { Button, cn, LogoMark } from '@trama/ui';
import { PlayIcon } from '@trama/ui/icons';
import type { ReactNode } from 'react';

const panel =
  'flex h-11 items-center rounded-block border border-border bg-floating shadow-floating';

/** Barra do canto de cima à esquerda do quadro (tela 1): logo, seção, título e aviso. */
export function BoardTitle({
  section,
  title,
  aside,
}: {
  section: string;
  title: string;
  /** Ex.: o aviso "Salvo" do salvamento automático. */
  aside?: ReactNode;
}) {
  return (
    <div className={cn(panel, 'gap-2.5 pr-4 pl-2.5 text-sm')}>
      <Link
        to="/"
        aria-label="Trama, página inicial"
        className="rounded-tag focus-visible:outline-2 focus-visible:outline-selection"
      >
        <LogoMark size={26} />
      </Link>
      <span className="font-semibold text-text-strong">Trama</span>
      <span className="h-4.5 w-px bg-border" aria-hidden />
      <span className="text-text-muted">{section}</span>
      <span className="text-text-muted" aria-hidden>
        /
      </span>
      <h1 className="max-w-80 truncate font-normal text-text-strong">{title}</h1>
      {aside}
    </div>
  );
}

/** Botão "Apresentar" do canto de cima à direita (tela 1): abre o modo aula (tela 2). */
export function PresentButton({ onPresent }: { onPresent: () => void }) {
  return (
    <div className={cn(panel, 'px-1.5')}>
      <Button onClick={onPresent} className="gap-1.5">
        <PlayIcon size={12} aria-hidden fill="currentColor" />
        Apresentar
      </Button>
    </div>
  );
}

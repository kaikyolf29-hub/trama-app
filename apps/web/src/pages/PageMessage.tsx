import { Link } from '@tanstack/react-router';
import { Alert, cn } from '@trama/ui';
import { textLinkClass } from './styles';

/** Página inteira com um aviso de erro e o caminho de volta ao Início. */
export function PageMessage({ children }: { children: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-page px-4">
      <div className="flex max-w-md flex-col gap-4">
        <Alert tone="error">{children}</Alert>
        <Link to="/" className={cn(textLinkClass, 'self-start text-sm')}>
          Voltar para o início
        </Link>
      </div>
    </div>
  );
}

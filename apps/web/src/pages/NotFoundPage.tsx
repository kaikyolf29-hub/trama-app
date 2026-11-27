import { Link } from '@tanstack/react-router';
import { AuthLayout } from './AuthLayout';
import { textLinkClass } from './styles';

export function NotFoundPage() {
  return (
    <AuthLayout title="Página não encontrada" subtitle="Este endereço não existe no Trama.">
      <Link to="/" className={`text-[13px] ${textLinkClass}`}>
        Ir para o início
      </Link>
    </AuthLayout>
  );
}

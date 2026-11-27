import { Link } from '@tanstack/react-router';
import { Logo } from '@trama/ui';
import type { ReactNode } from 'react';

interface AuthLayoutProps {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  /** Linha abaixo do cartão, ex.: "Não tem conta? Criar conta". */
  footer?: ReactNode;
}

/** Moldura das telas de login: o quadro pontilhado ao fundo, o logo e um cartão. */
export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <main className="bg-canvas-dots flex min-h-dvh flex-col items-center px-4 py-12 sm:justify-center">
      <div className="flex w-full max-w-[400px] flex-col gap-8">
        <Link
          to="/"
          className="self-center rounded-control focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-selection"
          aria-label="Trama, página inicial"
        >
          <Logo size={36} />
        </Link>
        <section className="rounded-block border border-border bg-surface p-6 shadow-block sm:p-8">
          <h1 className="font-serif text-2xl leading-tight font-semibold text-balance text-text-strong">
            {title}
          </h1>
          {subtitle && <p className="mt-2 text-text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </section>
        {footer && <p className="text-center text-[13px] text-text-muted">{footer}</p>}
      </div>
    </main>
  );
}

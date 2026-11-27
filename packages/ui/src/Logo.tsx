import { colors } from '../tokens';
import { cn } from './cn';

/** Caminho do "T" com serifa (docs/telas/8-marca.png). */
const T_PATH =
  'M12 12 H34 V19 H32.4 C32.2 17.2 31.4 16.3 29.6 16.2 H25 V28 H21 V16.2 H16.4 C14.6 16.3 13.8 17.2 13.6 19 H12 Z';

interface LogoMarkProps {
  /** Lado em px. */
  size?: number;
  className?: string;
  /** Texto para leitores de tela; sem ele, o logo é decorativo. */
  title?: string;
}

/**
 * O símbolo: um "T" com serifa terminando num ponto de conexão, num bloco com borda e
 * sombra dura, no espírito do Notion. Só preto e branco.
 */
export function LogoMark({ size = 32, className, title }: LogoMarkProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <rect x="3" y="6" width="40" height="39" rx="9" fill={colors.brandShadow} />
      <rect
        x="3"
        y="3"
        width="40"
        height="39"
        rx="9"
        fill={colors.brandPaper}
        stroke={colors.brandShadow}
        strokeWidth="2"
      />
      <path d={T_PATH} fill={colors.brandInk} />
      <circle cx="23" cy="32.5" r="4.2" fill={colors.brandInk} />
      <circle cx="23" cy="32.5" r="1.6" fill={colors.brandPaper} />
    </svg>
  );
}

interface LogoProps {
  /** Altura do símbolo em px; o nome acompanha. */
  size?: number;
  className?: string;
}

/** Símbolo e nome. O nome usa a Lora, como na tela 8. */
export function Logo({ size = 32, className }: LogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={size} />
      <span
        className="font-serif font-semibold tracking-tight text-text-strong"
        style={{ fontSize: Math.round(size * 0.72), lineHeight: 1 }}
      >
        Trama
      </span>
    </span>
  );
}

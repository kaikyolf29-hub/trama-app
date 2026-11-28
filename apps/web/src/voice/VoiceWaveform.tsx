import { cn } from '@trama/ui';
import { WAVE_BARS } from './recording-state';

/** As barras de volume da tela 5: as mais novas à direita; sem gravar, ficam baixas e paradas. */
export function VoiceWaveform({ levels, active }: { levels: number[]; active: boolean }) {
  const padded = [...Array<number>(Math.max(0, WAVE_BARS - levels.length)).fill(0), ...levels];
  return (
    <div aria-hidden data-testid="onda" className="flex h-8 items-center gap-[3px]">
      {padded.map((level, index) => (
        <span
          key={index}
          className={cn(
            'w-0.5 rounded-full transition-[height] duration-150',
            active && index >= padded.length - 3 ? 'bg-text-strong' : 'bg-text-muted',
          )}
          style={{ height: `${Math.round(4 + level * 28)}px`, opacity: active ? 1 : 0.4 }}
        />
      ))}
    </div>
  );
}

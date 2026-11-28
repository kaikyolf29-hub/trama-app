import { sceneCardTag, type ScriptContent } from '@trama/core';

/** Pré-visualização do roteiro que a IA montou: uma caixa por cena, na ordem. */
export function ScriptPreview({ script }: { script: ScriptContent }) {
  return (
    <div className="flex flex-col gap-3" data-testid="script-preview">
      {script.targetDuration && (
        <p className="text-[13px] text-text-muted">Duração alvo: {script.targetDuration}</p>
      )}
      <ol className="flex flex-col gap-3">
        {script.scenes.map((scene, index) => (
          <li
            key={scene.id}
            className="rounded-block border border-border bg-surface p-4 text-left shadow-block"
          >
            <p className="flex items-baseline justify-between gap-3 text-xs font-semibold tracking-wider text-text-muted uppercase">
              <span>{sceneCardTag(index)}</span>
              {scene.time && <span className="font-normal normal-case">{scene.time}</span>}
            </p>
            <h3 className="text-base font-semibold text-text-strong">{scene.title}</h3>
            {scene.narration && (
              <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap text-text">
                {scene.narration}
              </p>
            )}
            {scene.broll.length > 0 && (
              <p className="mt-2 text-[13px] text-text-muted">
                <span className="font-semibold">B-roll: </span>
                {scene.broll.join(' · ')}
              </p>
            )}
            {scene.notes && (
              <p className="mt-1 text-[13px] text-text-muted">
                <span className="font-semibold">Notas: </span>
                {scene.notes}
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { goToBody } from './editor-commands';

export function SceneTitleView({ node, editor, getPos, updateAttributes }: NodeViewProps) {
  const time = typeof node.attrs['time'] === 'string' ? node.attrs['time'] : '';
  const id = typeof node.attrs['id'] === 'string' ? node.attrs['id'] : undefined;
  return (
    <NodeViewWrapper className="scene-head" data-scene-id={id}>
      <NodeViewContent role="heading" aria-level={2} className="scene-title" />
      <span contentEditable={false} aria-hidden className="scene-dot">
        ·
      </span>
      <input
        type="text"
        value={time}
        maxLength={40}
        aria-label="Tempo da cena"
        placeholder="0:00–0:15"
        contentEditable={false}
        // Fora da ordem do Tab: o editor inteiro é um campo só, e o Tab do título (abaixo)
        // leva ao tempo; do tempo, Tab ou Enter vão para o texto da cena.
        tabIndex={-1}
        onChange={(event) => updateAttributes({ time: event.target.value })}
        onKeyDown={(event) => {
          const pos = getPos();
          if (pos === undefined) return;
          if (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey)) {
            event.preventDefault();
            goToBody(editor, pos);
          } else if (event.key === 'Tab' && event.shiftKey) {
            event.preventDefault();
            editor
              .chain()
              .focus()
              .setTextSelection(pos + 1 + node.content.size)
              .run();
          }
        }}
        className="scene-time"
      />
    </NodeViewWrapper>
  );
}

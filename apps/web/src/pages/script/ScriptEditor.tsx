import type { Editor, JSONContent } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Scene } from '@trama/core';
import { useEffect, useRef } from 'react';
import { scenesToDoc } from './doc';
import { scriptExtensions } from './extensions';
import './script-editor.css';

/**
 * O texto do roteiro, no Tiptap. Só aqui se conhece o editor: quem usa recebe o documento a cada
 * mudança (`onDoc`) e o `Editor` (`onEditor`) para trocar o conteúdo quando as cenas mudam por
 * fora, como em "Trazer do quadro".
 */
export function ScriptEditor({
  initial,
  onDoc,
  onEditor,
}: {
  /** As cenas de quando o roteiro abriu; depois disso o editor é a fonte do texto. */
  initial: readonly Scene[];
  onDoc: (doc: JSONContent) => void;
  onEditor: (editor: Editor | null) => void;
}) {
  const latest = useRef(onDoc);
  useEffect(() => {
    latest.current = onDoc;
  });

  const editor = useEditor({
    extensions: scriptExtensions(),
    content: scenesToDoc(initial),
    editorProps: {
      attributes: {
        class: 'script-editor',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Texto do roteiro',
      },
    },
    onUpdate: ({ editor: current }) => latest.current(current.getJSON()),
  });

  useEffect(() => {
    onEditor(editor);
    return () => onEditor(null);
  }, [editor, onEditor]);

  return <EditorContent editor={editor} />;
}

import type { Editor } from '@tiptap/core';
import type { Scene } from '@trama/core';
import { NODE, scenesToDoc } from './doc';

/** Troca o texto do editor pelas cenas, sem entrar no desfazer e sem avisar `onDoc`. */
export function setEditorScenes(editor: Editor, scenes: readonly Scene[]): void {
  editor
    .chain()
    .setMeta('addToHistory', false)
    .setContent(scenesToDoc(scenes), { emitUpdate: false })
    .run();
}

/** Leva o cursor ao título da cena e rola até ela. */
export function focusScene(editor: Editor, sceneId: string): void {
  let target = -1;
  editor.state.doc.descendants((node, pos) => {
    if (target < 0 && node.type.name === NODE.title && node.attrs['id'] === sceneId) target = pos;
    return target < 0;
  });
  if (target < 0) return;
  editor
    .chain()
    .focus()
    .setTextSelection(target + 1)
    .scrollIntoView()
    .run();
}

/**
 * Do título para o texto da cena (Enter no título, Tab ou Enter no tempo): leva o cursor ao
 * primeiro bloco de baixo, criando um parágrafo se a cena ainda não tem nada.
 */
export function goToBody(editor: Editor, titlePos: number): boolean {
  const title = editor.state.doc.nodeAt(titlePos);
  if (!title) return false;
  const after = titlePos + title.nodeSize;
  const next = editor.state.doc.nodeAt(after);
  if (next && next.type.name !== NODE.title) {
    return editor
      .chain()
      .focus()
      .setTextSelection(after + 1)
      .run();
  }
  return editor
    .chain()
    .insertContentAt(after, { type: NODE.notes })
    .focus()
    .setTextSelection(after + 1)
    .run();
}


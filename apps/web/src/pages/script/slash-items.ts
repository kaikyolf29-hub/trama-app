import type { Editor, Range } from '@tiptap/core';
import { NODE } from './doc';

/** Um bloco do menu "/" (tela 3, "Blocos de roteiro"). */
export interface SlashItem {
  label: string;
  hint: string;
  /** Outras palavras que também acham o bloco ("/plano" acha "Plano / B-roll"). */
  keywords: string;
  run: (editor: Editor, range: Range) => void;
}

/** Apaga o "/..." e troca o bloco de agora pelo tipo escolhido. */
const turnInto = (type: string) => (editor: Editor, range: Range) => {
  editor.chain().focus().deleteRange(range).setNode(type).run();
};

export const SLASH_ITEMS: readonly SlashItem[] = [
  {
    label: 'Cena',
    hint: 'título + tempo',
    keywords: 'cena scene título tempo',
    run: turnInto(NODE.title),
  },
  {
    label: 'Fala',
    hint: 'o que é dito',
    keywords: 'fala narração texto',
    run: turnInto(NODE.narration),
  },
  {
    label: 'Plano / B-roll',
    hint: '',
    keywords: 'plano broll b-roll imagem',
    run: turnInto(NODE.broll),
  },
  {
    label: 'Nota',
    hint: 'direção da cena',
    keywords: 'nota direção parágrafo',
    run: turnInto(NODE.notes),
  },
];


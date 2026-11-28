import { Extension, mergeAttributes, Node, type Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { Placeholder, UndoRedo } from '@tiptap/extensions';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { ReactNodeViewRenderer, ReactRenderer } from '@tiptap/react';
import Suggestion from '@tiptap/suggestion';
import { NODE } from './doc';
import { goToBody } from './editor-commands';
import { SceneTitleView } from './SceneTitleView';
import { SlashList, type SlashListHandle } from './SlashList';
import { SLASH_ITEMS, type SlashItem } from './slash-items';

/**
 * O editor do roteiro (Tiptap): um documento de blocos, e não um texto livre. Só existem
 * título de cena (com o tempo), parágrafo de notas, fala e plano de B-roll, sem negrito nem
 * itálico, porque o que se guarda (`scriptContentSchema`) é texto simples. As conversões
 * ficam em `doc.ts`.
 */

/** O título da cena, com o campo de tempo ao lado ("Gancho · 0:00–0:15" da tela 3). */
const SceneTitle = Node.create({
  name: NODE.title,
  content: 'text*',
  marks: '',
  defining: true,
  addAttributes() {
    return {
      id: { default: null, rendered: false },
      time: { default: '', rendered: false },
    };
  },
  parseHTML() {
    return [{ tag: 'h2[data-scene]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['h2', mergeAttributes(HTMLAttributes, { 'data-scene': '' }), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(SceneTitleView);
  },
  addKeyboardShortcuts() {
    return {
      // Enter no título não divide a cena: leva o cursor para o texto de baixo.
      Enter: ({ editor }) => {
        const { $from } = editor.state.selection;
        if ($from.parent.type.name !== NODE.title) return false;
        return goToBody(editor, $from.before());
      },
      // Tab no título vai para o campo de tempo da mesma cena.
      Tab: ({ editor }) => {
        const { $from } = editor.state.selection;
        if ($from.parent.type.name !== NODE.title) return false;
        const dom = editor.view.nodeDOM($from.before());
        const input = dom instanceof HTMLElement ? dom.querySelector('input') : null;
        input?.focus();
        return input !== null;
      },
    };
  },
});

/** Bloco de texto de uma linha (fala ou B-roll): Enter e Backspace num bloco vazio saem dele. */
function lineBlock(name: string, tag: string, label: string) {
  return Node.create({
    name,
    content: 'text*',
    marks: '',
    parseHTML() {
      return [{ tag: `${tag}[data-block="${name}"]` }];
    },
    renderHTML({ HTMLAttributes }) {
      return [
        tag,
        mergeAttributes(HTMLAttributes, {
          'data-block': name,
          'data-label': label,
          class: `scene-block scene-${name}`,
        }),
        0,
      ];
    },
    addKeyboardShortcuts() {
      const leave = ({ editor }: { editor: Editor }) => {
        const { selection } = editor.state;
        if (!selection.empty || selection.$from.parent.type.name !== name) return false;
        if (selection.$from.parent.content.size > 0) return false;
        return editor.commands.setNode(NODE.notes);
      };
      return { Enter: leave, Backspace: leave };
    },
  });
}

const Narration = lineBlock(NODE.narration, 'div', 'Fala');
const Broll = lineBlock(NODE.broll, 'div', 'Plano');

/** Toda cena tem um id único: um título novo (ou colado, ou dividido) recebe o seu. */
const SceneIds = Extension.create({
  name: 'sceneIds',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('sceneIds'),
        appendTransaction: (transactions, _before, state) => {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;
          const seen = new Set<string>();
          let fix = state.tr;
          let changed = false;
          state.doc.descendants((node, pos) => {
            if (node.type.name !== NODE.title) return false;
            const current: unknown = node.attrs['id'];
            if (typeof current === 'string' && current !== '' && !seen.has(current)) {
              seen.add(current);
              return false;
            }
            const id = crypto.randomUUID();
            seen.add(id);
            fix = fix.setNodeMarkup(pos, undefined, { ...node.attrs, id });
            changed = true;
            return false;
          });
          return changed ? fix : null;
        },
      }),
    ];
  },
});

/** "/" no começo de uma linha abre o menu de blocos de roteiro (tela 3). */
const SlashMenu = Extension.create({
  name: 'slashMenu',
  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        char: '/',
        startOfLine: true,
        // Dentro do título não há o que inserir.
        allow: ({ state, range }) => state.doc.resolve(range.from).parent.type.name !== NODE.title,
        items: ({ query }) => {
          const needle = query.trim().toLocaleLowerCase('pt-BR');
          return SLASH_ITEMS.filter((item) =>
            `${item.label} ${item.keywords}`.toLocaleLowerCase('pt-BR').includes(needle),
          );
        },
        command: ({ editor, range, props }) => props.run(editor, range),
        render: () => {
          let renderer: ReactRenderer<SlashListHandle> | undefined;
          let unmount: (() => void) | undefined;
          return {
            onStart: (props) => {
              renderer = new ReactRenderer(SlashList, { props, editor: props.editor });
              unmount = props.mount(renderer.element);
            },
            onUpdate: (props) => renderer?.updateProps(props),
            onKeyDown: ({ event }) => {
              if (event.key === 'Escape') return false;
              return renderer?.ref?.onKeyDown(event) ?? false;
            },
            onExit: () => {
              unmount?.();
              renderer?.destroy();
              renderer = undefined;
            },
          };
        },
      }),
    ];
  },
});

const PLACEHOLDERS: Record<string, string> = {
  [NODE.title]: 'Título da cena',
  [NODE.narration]: 'O que é dito',
  [NODE.broll]: 'Plano ou B-roll',
  [NODE.notes]: 'Direção da cena. Digite / para inserir blocos',
};

/** As extensões do editor do roteiro. Tab não é capturado: ele anda entre os campos. */
export function scriptExtensions() {
  return [
    Document.extend({
      content: `(${NODE.title} (${NODE.notes} | ${NODE.narration} | ${NODE.broll})*)+`,
    }),
    Text,
    Paragraph.configure({ HTMLAttributes: { class: 'scene-block scene-notes' } }),
    SceneTitle,
    Narration,
    Broll,
    SceneIds,
    SlashMenu,
    UndoRedo,
    Placeholder.configure({
      showOnlyCurrent: false,
      placeholder: ({ node }) => PLACEHOLDERS[node.type.name] ?? '',
    }),
  ];
}

// CodeMirror 6 configuration: Python highlighting, sensible defaults for
// beginners (4-space Tab, line numbers), and a light theme that matches the
// app's design tokens. CodeMirror is used over Monaco because it is ~10x
// lighter and actually usable on iPad/Android touchscreens.
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { python } from '@codemirror/lang-python';
import {
  bracketMatching,
  defaultHighlightStyle,
  indentUnit,
  syntaxHighlighting,
} from '@codemirror/language';
import { Compartment, EditorState } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view';

const theme = EditorView.theme({
  '&': { backgroundColor: 'transparent', height: '100%' },
  '.cm-scroller': {
    fontFamily: 'var(--font-code)',
    lineHeight: '1.6',
  },
  '.cm-content': { padding: '12px 0', caretColor: 'var(--accent)' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    borderRight: '1px solid var(--border)',
    color: 'var(--muted)',
    opacity: '0.75',
  },
  '.cm-activeLine': { backgroundColor: 'rgb(47 111 237 / 0.05)' },
  '.cm-activeLineGutter': { backgroundColor: 'rgb(47 111 237 / 0.08)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'rgb(47 111 237 / 0.16) !important',
  },
  '.cm-cursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
});

export interface EditorHandle {
  view: EditorView;
  getCode(): string;
  setCode(code: string): void;
}

export function createEditor(
  parent: HTMLElement,
  initialCode: string,
  onRunShortcut: () => void,
): EditorHandle {
  const readOnly = new Compartment();
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: initialCode,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        drawSelection(),
        history(),
        bracketMatching(),
        indentUnit.of('    '),
        python(),
        syntaxHighlighting(defaultHighlightStyle),
        keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              onRunShortcut();
              return true;
            },
          },
          indentWithTab,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        theme,
        readOnly.of([]),
        EditorView.lineWrapping,
      ],
    }),
  });
  return {
    view,
    getCode: () => view.state.doc.toString(),
    setCode: (code) =>
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } }),
  };
}

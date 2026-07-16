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
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark';
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view';

// Syntax colors can't be driven by CSS variables, so each editor keeps its
// highlight style in a compartment and setEditorsDark() swaps them all live.
const registry = new Map<EditorView, Compartment>();
let currentDark = false;

const highlighter = (dark: boolean) =>
  syntaxHighlighting(dark ? oneDarkHighlightStyle : defaultHighlightStyle);

export function setEditorsDark(dark: boolean): void {
  currentDark = dark;
  for (const [view, compartment] of registry) {
    view.dispatch({ effects: compartment.reconfigure(highlighter(dark)) });
  }
}

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
  destroy(): void;
}

export interface EditorOptions {
  /** Mod+Enter (run in place). */
  onRun?: () => void;
  /** Shift+Enter (notebook: run and advance). */
  onShiftEnter?: () => void;
  onChange?: (code: string) => void;
  /** Cells grow with content; the script editor fills its card. */
  lineNumbers?: boolean;
}

export function createEditor(
  parent: HTMLElement,
  initialCode: string,
  opts: EditorOptions = {},
): EditorHandle {
  const readOnly = new Compartment();
  const highlight = new Compartment();
  const bindings = [];
  if (opts.onRun) {
    const onRun = opts.onRun;
    bindings.push({
      key: 'Mod-Enter',
      run: () => {
        onRun();
        return true;
      },
    });
  }
  if (opts.onShiftEnter) {
    const onShiftEnter = opts.onShiftEnter;
    bindings.push({
      key: 'Shift-Enter',
      run: () => {
        onShiftEnter();
        return true;
      },
    });
  }
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: initialCode,
      extensions: [
        ...(opts.lineNumbers === false ? [] : [lineNumbers(), highlightActiveLineGutter()]),
        highlightActiveLine(),
        drawSelection(),
        history(),
        bracketMatching(),
        indentUnit.of('    '),
        python(),
        highlight.of(highlighter(currentDark)),
        keymap.of([...bindings, indentWithTab, ...defaultKeymap, ...historyKeymap]),
        theme,
        readOnly.of([]),
        EditorView.lineWrapping,
        ...(opts.onChange
          ? [
              EditorView.updateListener.of((u) => {
                if (u.docChanged) opts.onChange!(u.state.doc.toString());
              }),
            ]
          : []),
      ],
    }),
  });
  registry.set(view, highlight);
  return {
    view,
    getCode: () => view.state.doc.toString(),
    setCode: (code) =>
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } }),
    destroy: () => {
      registry.delete(view);
      view.destroy();
    },
  };
}

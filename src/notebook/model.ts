// In-memory notebook model. Deliberately close to nbformat so serialization
// stays a thin mapping (see ipynb.ts).

export interface OutputChunk {
  kind: 'stream-out' | 'stream-err' | 'error' | 'result' | 'stdin-echo' | 'info';
  text: string;
}

export interface CodeCell {
  id: string;
  type: 'code';
  source: string;
  outputs: OutputChunk[];
  /** Jupyter execution counter; '*' while queued/running. */
  execCount: number | '*' | null;
}

export interface MarkdownCell {
  id: string;
  type: 'markdown';
  source: string;
  /** UI state: false while the user is editing the text. */
  rendered: boolean;
}

export type Cell = CodeCell | MarkdownCell;

export interface Notebook {
  name: string;
  cells: Cell[];
}

export function cellId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function newCodeCell(source = ''): CodeCell {
  return { id: cellId(), type: 'code', source, outputs: [], execCount: null };
}

export function newMarkdownCell(source = '', rendered = false): MarkdownCell {
  return { id: cellId(), type: 'markdown', source, rendered };
}

export function starterNotebook(): Notebook {
  return {
    name: 'welcome.ipynb',
    cells: [
      newMarkdownCell(
        '# Welcome to PicoPy 📓\n\n' +
          'This is a **notebook**: a mix of text and runnable Python code.\n\n' +
          '- Press the ▶ button on a code cell (or `Shift+Enter`) to run it.\n' +
          '- Cells share their variables — run them top to bottom.\n' +
          '- Double-click any text cell (like this one) to edit it.',
        true,
      ),
      newCodeCell('message = "Hello, notebook!"\nprint(message)'),
      newCodeCell('# Variables from the cell above are available here:\nmessage.upper()'),
    ],
  };
}

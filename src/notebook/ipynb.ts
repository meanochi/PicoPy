// Reads and writes Jupyter's .ipynb format (nbformat 4.5) so PicoPy notebooks
// are interchangeable with Colab and Jupyter. Rich outputs we can't render
// (images, HTML) degrade to their text/plain form when present.
import {
  type Cell,
  type CodeCell,
  type Notebook,
  type OutputChunk,
  cellId,
  newCodeCell,
  newMarkdownCell,
} from './model';

/** nbformat stores multi-line text as arrays of '\n'-terminated lines. */
type MultilineString = string | string[];

const joinText = (s: MultilineString | undefined): string =>
  Array.isArray(s) ? s.join('') : (s ?? '');

const splitText = (s: string): string[] => {
  const lines = s.split('\n');
  return lines.map((l, i) => (i < lines.length - 1 ? l + '\n' : l)).filter((l) => l !== '');
};

interface IpynbOutput {
  output_type: string;
  name?: string;
  text?: MultilineString;
  ename?: string;
  evalue?: string;
  traceback?: string[];
  execution_count?: number | null;
  data?: Record<string, MultilineString>;
}

interface IpynbCell {
  id?: string;
  cell_type: string;
  source?: MultilineString;
  metadata?: Record<string, unknown>;
  execution_count?: number | null;
  outputs?: IpynbOutput[];
}

// Jupyter tracebacks carry ANSI color escape codes; strip them for display.
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\u001b\[[0-9;]*m/g;

function parseOutputs(outputs: IpynbOutput[] | undefined): OutputChunk[] {
  const chunks: OutputChunk[] = [];
  for (const o of outputs ?? []) {
    switch (o.output_type) {
      case 'stream':
        chunks.push({
          kind: o.name === 'stderr' ? 'stream-err' : 'stream-out',
          text: joinText(o.text),
        });
        break;
      case 'error':
        chunks.push({
          kind: 'error',
          text: (o.traceback?.join('\n') ?? `${o.ename}: ${o.evalue}`).replace(ANSI_RE, ''),
        });
        break;
      case 'execute_result':
      case 'display_data': {
        const plain = o.data?.['text/plain'];
        if (plain !== undefined) chunks.push({ kind: 'result', text: joinText(plain) });
        break;
      }
    }
  }
  return chunks;
}

export function parseIpynb(json: string, name: string): Notebook {
  const doc = JSON.parse(json) as { nbformat?: number; cells?: IpynbCell[] };
  if (!Array.isArray(doc.cells)) throw new Error('Not a Jupyter notebook: missing cells');
  const cells: Cell[] = doc.cells.map((c) => {
    const source = joinText(c.source);
    if (c.cell_type === 'markdown') {
      const cell = newMarkdownCell(source, true);
      cell.id = c.id ?? cell.id;
      return cell;
    }
    // Treat 'raw' cells as code shown but never run? Simpler: keep as code.
    const cell = newCodeCell(source);
    cell.id = c.id ?? cell.id;
    cell.execCount = typeof c.execution_count === 'number' ? c.execution_count : null;
    cell.outputs = parseOutputs(c.outputs);
    return cell;
  });
  return { name, cells: cells.length ? cells : [newCodeCell()] };
}

function serializeOutputs(cell: CodeCell): IpynbOutput[] {
  const out: IpynbOutput[] = [];
  for (const chunk of cell.outputs) {
    switch (chunk.kind) {
      case 'stream-out':
      case 'stdin-echo':
        out.push({ output_type: 'stream', name: 'stdout', text: splitText(chunk.text) });
        break;
      case 'stream-err':
        out.push({ output_type: 'stream', name: 'stderr', text: splitText(chunk.text) });
        break;
      case 'error': {
        const lines = chunk.text.split('\n');
        const last = lines[lines.length - 1] ?? '';
        const sep = last.indexOf(': ');
        out.push({
          output_type: 'error',
          ename: sep > 0 ? last.slice(0, sep) : last,
          evalue: sep > 0 ? last.slice(sep + 2) : '',
          traceback: lines,
        });
        break;
      }
      case 'result':
        out.push({
          output_type: 'execute_result',
          execution_count: typeof cell.execCount === 'number' ? cell.execCount : null,
          data: { 'text/plain': splitText(chunk.text) },
          metadata: {} as Record<string, MultilineString>,
        } as IpynbOutput);
        break;
      case 'info':
        break; // UI-only annotations ("stopped") don't belong in the file
    }
  }
  return out;
}

export function serializeIpynb(nb: Notebook, pythonVersion?: string): string {
  const cells: IpynbCell[] = nb.cells.map((c) =>
    c.type === 'markdown'
      ? { id: c.id || cellId(), cell_type: 'markdown', metadata: {}, source: splitText(c.source) }
      : {
          id: c.id || cellId(),
          cell_type: 'code',
          metadata: {},
          execution_count: typeof c.execCount === 'number' ? c.execCount : null,
          outputs: serializeOutputs(c),
          source: splitText(c.source),
        },
  );
  const doc = {
    cells,
    metadata: {
      kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
      language_info: { name: 'python', ...(pythonVersion ? { version: pythonVersion } : {}) },
    },
    nbformat: 4,
    nbformat_minor: 5,
  };
  return JSON.stringify(doc, null, 1) + '\n';
}

// One notebook cell: Colab-style card with a run gutter, editor (or rendered
// markdown), a hover/touch toolbar, and outputs underneath.
import { useEffect, useRef } from 'preact/hooks';
import { OutputView } from '../app/OutputView';
import { createEditor, type EditorHandle } from '../editor/setup';
import { t } from '../i18n';
import type { Cell } from './model';
import { renderMarkdown } from './markdown';

export interface CellActions {
  onRun(id: string): void;
  onChange(id: string, source: string): void;
  onMove(id: string, dir: -1 | 1): void;
  onDelete(id: string): void;
  onSetRendered(id: string, rendered: boolean): void;
  onStdin(value: string): void;
}

interface Props extends CellActions {
  cell: Cell;
  isRunning: boolean;
  stdinActive: boolean;
  isFirst: boolean;
  isLast: boolean;
}

export function CellView(props: Props) {
  const { cell } = props;
  return (
    <article
      class={`cell ${cell.type === 'code' ? 'cell--code' : 'cell--md'} ${props.isRunning ? 'cell--running' : ''}`}
      data-testid={`cell-${cell.type}`}
    >
      <div class="cell__toolbar">
        <button
          class="cell__tool"
          title={t('cell.moveUp')}
          aria-label={t('cell.moveUp')}
          disabled={props.isFirst}
          onClick={() => props.onMove(cell.id, -1)}
        >
          ↑
        </button>
        <button
          class="cell__tool"
          title={t('cell.moveDown')}
          aria-label={t('cell.moveDown')}
          disabled={props.isLast}
          onClick={() => props.onMove(cell.id, 1)}
        >
          ↓
        </button>
        {cell.type === 'markdown' && cell.rendered && (
          <button
            class="cell__tool"
            title={t('cell.edit')}
            aria-label={t('cell.edit')}
            onClick={() => props.onSetRendered(cell.id, false)}
          >
            ✎
          </button>
        )}
        <button
          class="cell__tool cell__tool--danger"
          title={t('cell.delete')}
          aria-label={t('cell.delete')}
          onClick={() => props.onDelete(cell.id)}
        >
          ✕
        </button>
      </div>
      {cell.type === 'code' ? <CodeBody {...props} /> : <MarkdownBody {...props} />}
    </article>
  );
}

function CodeBody(props: Props) {
  const { cell } = props;
  if (cell.type !== 'code') return null;
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorHandle>();
  // Keep latest callbacks without re-creating the editor.
  const cbRef = useRef({ run: () => props.onRun(cell.id), change: (s: string) => props.onChange(cell.id, s) });
  cbRef.current = { run: () => props.onRun(cell.id), change: (s: string) => props.onChange(cell.id, s) };

  useEffect(() => {
    if (!hostRef.current || editorRef.current) return;
    editorRef.current = createEditor(hostRef.current, cell.source, {
      onRun: () => cbRef.current.run(),
      onShiftEnter: () => cbRef.current.run(),
      onChange: (s) => cbRef.current.change(s),
      lineNumbers: false,
    });
    return () => {
      editorRef.current?.destroy();
      editorRef.current = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const count = cell.execCount === null ? ' ' : cell.execCount;
  return (
    <div class="cell__main">
      <div class="cell__gutter">
        <button
          class="cell__run"
          title={t('cell.run')}
          aria-label={t('cell.run')}
          onClick={() => props.onRun(cell.id)}
        >
          {props.isRunning ? <span class="cell__spinner" aria-hidden="true" /> : '▶'}
        </button>
        <span class="cell__count" aria-hidden="true">
          [{count}]
        </span>
      </div>
      <div class="cell__content">
        <div class="cell__editor" ref={hostRef} />
        {(cell.outputs.length > 0 || props.stdinActive) && (
          <div class="cell__outputs">
            <OutputView
              chunks={cell.outputs}
              stdinActive={props.stdinActive}
              onStdin={props.onStdin}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function MarkdownBody(props: Props) {
  const { cell } = props;
  if (cell.type !== 'markdown') return null;
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!cell.rendered && taRef.current) {
      taRef.current.focus();
      autosize(taRef.current);
    }
  }, [cell.rendered]);

  if (cell.rendered) {
    return (
      <div
        class="cell__md"
        title={t('cell.editHint')}
        onDblClick={() => props.onSetRendered(cell.id, false)}
        // Sanitized by DOMPurify in renderMarkdown.
        dangerouslySetInnerHTML={{ __html: renderMarkdown(cell.source || `*${t('cell.emptyText')}*`) }}
      />
    );
  }
  return (
    <div class="cell__mdedit">
      <textarea
        ref={taRef}
        class="cell__ta"
        value={cell.source}
        placeholder={t('cell.textPlaceholder')}
        onInput={(e) => {
          const el = e.currentTarget;
          autosize(el);
          props.onChange(cell.id, el.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.shiftKey) {
            e.preventDefault();
            props.onSetRendered(cell.id, true);
          }
        }}
        onBlur={() => props.onSetRendered(cell.id, true)}
      />
    </div>
  );
}

function autosize(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 4 + 'px';
}

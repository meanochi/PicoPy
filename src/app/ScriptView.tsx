// Script mode: one editor, one console — like running `python main.py`.
import { useEffect, useRef } from 'preact/hooks';
import { createEditor, type EditorHandle } from '../editor/setup';
import { t } from '../i18n';
import type { OutputChunk } from '../notebook/model';
import { OutputView } from './OutputView';

interface Props {
  initialCode: string;
  chunks: OutputChunk[];
  truncated: boolean;
  stdinActive: boolean;
  onStdin(value: string): void;
  onRunShortcut(): void;
  onChange(code: string): void;
  editorRef: { current?: EditorHandle };
}

export function ScriptView(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const cbRef = useRef({ run: props.onRunShortcut, change: props.onChange });
  cbRef.current = { run: props.onRunShortcut, change: props.onChange };

  useEffect(() => {
    if (!hostRef.current || props.editorRef.current) return;
    props.editorRef.current = createEditor(hostRef.current, props.initialCode, {
      onRun: () => cbRef.current.run(),
      onChange: (s) => cbRef.current.change(s),
    });
    return () => {
      props.editorRef.current?.destroy();
      props.editorRef.current = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main class="workspace">
      <section class="card editor-card" aria-label={t('editor.title')}>
        <div class="card__head">
          <span class="card__title">{t('editor.title')}</span>
          <span class="card__hint">{t('editor.runHint')}</span>
        </div>
        <div class="editor-host" ref={hostRef} />
      </section>

      <section class="card" aria-label={t('console.title')}>
        <div class="card__head">
          <span class="card__title">{t('console.title')}</span>
        </div>
        <OutputView
          chunks={props.chunks}
          truncated={props.truncated}
          stdinActive={props.stdinActive}
          onStdin={props.onStdin}
          autoScroll
          emptyText={t('console.empty')}
        />
      </section>
    </main>
  );
}

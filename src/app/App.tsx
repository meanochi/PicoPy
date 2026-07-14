import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { createEditor, type EditorHandle } from '../editor/setup';
import { t } from '../i18n';
import { Runtime, type RuntimeState } from '../runtime/manager';
import type { PythonErrorInfo } from '../runtime/protocol';

const STARTER_CODE = `# Welcome to PicoPy! Press Run ▶ to try this program.

name = input("What's your name? ")
print(f"Hello, {name}! Welcome to Python 🐍")

for i in range(1, 4):
    print(i * "⭐")
`;

interface ConsoleEntry {
  kind: 'out' | 'err' | 'in' | 'info';
  text: string;
}

/** Cap console memory so `while True: print(...)` can't freeze the tab. */
const MAX_CONSOLE_CHARS = 400_000;

export function App() {
  const [runtimeState, setRuntimeState] = useState<RuntimeState>({ phase: 'starting' });
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const [truncated, setTruncated] = useState(false);
  const editorHostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorHandle>();
  const consoleRef = useRef<HTMLDivElement>(null);
  const stdinRef = useRef<HTMLInputElement>(null);

  const append = useCallback((kind: ConsoleEntry['kind'], text: string) => {
    setEntries((prev) => {
      const next =
        prev.length && prev[prev.length - 1].kind === kind
          ? [...prev.slice(0, -1), { kind, text: prev[prev.length - 1].text + text }]
          : [...prev, { kind, text }];
      let total = next.reduce((n, e) => n + e.text.length, 0);
      while (total > MAX_CONSOLE_CHARS && next.length) {
        const first = next[0];
        const excess = total - MAX_CONSOLE_CHARS;
        if (first.text.length <= excess) {
          next.shift();
          total -= first.text.length;
        } else {
          next[0] = { ...first, text: first.text.slice(excess) };
          total = MAX_CONSOLE_CHARS;
        }
        setTruncated(true);
      }
      return next;
    });
  }, []);

  const runtime = useMemo(
    () =>
      new Runtime({
        onState: setRuntimeState,
        onOutput: (kind, text) => append(kind === 'stderr' ? 'err' : 'out', text),
        onRunDone: (ok: boolean, error?: PythonErrorInfo) => {
          if (error) append('err', error.traceback + '\n');
          append('info', (ok ? t('console.finished') : t('console.stopped')) + '\n');
        },
      }),
    [append],
  );

  useEffect(() => {
    void runtime.start();
  }, [runtime]);

  const onRun = useCallback(() => {
    const code = editorRef.current?.getCode() ?? '';
    if (runtime.getState().phase !== 'ready') return;
    setEntries([]);
    setTruncated(false);
    runtime.run(code);
  }, [runtime]);

  useEffect(() => {
    if (editorHostRef.current && !editorRef.current) {
      editorRef.current = createEditor(editorHostRef.current, STARTER_CODE, () => onRun());
    }
  }, [onRun]);

  // Test/automation hook (also handy for classroom tooling).
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__picopy = {
      setCode: (code: string) => editorRef.current?.setCode(code),
      getCode: () => editorRef.current?.getCode(),
      run: onRun,
    };
  }, [onRun]);

  // Keep the console pinned to the bottom as output streams in.
  useEffect(() => {
    const el = consoleRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, runtimeState.phase]);

  useEffect(() => {
    if (runtimeState.phase === 'awaiting-input') stdinRef.current?.focus();
  }, [runtimeState.phase]);

  const submitStdin = useCallback(
    (e: Event) => {
      e.preventDefault();
      const field = stdinRef.current;
      if (!field) return;
      const value = field.value;
      field.value = '';
      append('in', value + '\n');
      void runtime.provideStdin(value);
    },
    [append, runtime],
  );

  const { phase } = runtimeState;
  const running = phase === 'running' || phase === 'awaiting-input';
  const statusLabel = {
    starting: t('status.starting'),
    ready: t('status.ready'),
    running: t('status.running'),
    'awaiting-input': t('status.awaitingInput'),
    failed: t('status.failed'),
  }[phase];

  return (
    <>
      <header class="topbar">
        <div class="topbar__logo">
          <span class="topbar__mark" aria-hidden="true">
            Py
          </span>
          {t('app.name')}
        </div>
        <span class="topbar__file">{t('file.defaultScript')}</span>
      </header>

      <div class="actionbar">
        {running ? (
          <button class="btn btn--stop" onClick={() => void runtime.stop()}>
            <span class="btn__icon" aria-hidden="true">
              ⏹
            </span>
            {t('action.stop')}
          </button>
        ) : (
          <button class="btn btn--run" disabled={phase !== 'ready'} onClick={onRun}>
            <span class="btn__icon" aria-hidden="true">
              ▶
            </span>
            {t('action.run')}
          </button>
        )}
        <span
          class={`chip chip--${phase}`}
          title={
            runtimeState.pythonVersion
              ? t('status.pythonTitle', { version: runtimeState.pythonVersion })
              : undefined
          }
        >
          <span class="chip__dot" aria-hidden="true" />
          {statusLabel}
        </span>
      </div>

      {phase === 'failed' && (
        <p class="banner-error">
          {t('console.bootErrorHelp')}
          {runtimeState.bootError ? ` (${runtimeState.bootError})` : ''}
        </p>
      )}

      <main class="workspace">
        <section class="card editor-card" aria-label={t('editor.title')}>
          <div class="card__head">
            <span class="card__title">{t('editor.title')}</span>
            <span class="card__hint">{t('editor.runHint')}</span>
          </div>
          <div class="editor-host" ref={editorHostRef} />
        </section>

        <section class="card" aria-label={t('console.title')}>
          <div class="card__head">
            <span class="card__title">{t('console.title')}</span>
          </div>
          <div class="console" ref={consoleRef} data-testid="console">
            {entries.length === 0 && phase !== 'running' ? (
              <span class="console__empty">{t('console.empty')}</span>
            ) : (
              <>
                {truncated && <span class="console__info">{t('console.truncated') + '\n'}</span>}
                {entries.map((e, i) => (
                  <span key={i} class={e.kind === 'out' ? undefined : `console__${e.kind}`}>
                    {e.text}
                  </span>
                ))}
              </>
            )}
          </div>
          {phase === 'awaiting-input' && (
            <form class="stdin" onSubmit={submitStdin}>
              <input
                ref={stdinRef}
                class="stdin__field"
                data-testid="stdin-field"
                placeholder={t('input.placeholder')}
                autocomplete="off"
                autocapitalize="off"
                spellcheck={false}
              />
              <button type="submit" class="stdin__send">
                {t('input.send')}
              </button>
            </form>
          )}
        </section>
      </main>
    </>
  );
}

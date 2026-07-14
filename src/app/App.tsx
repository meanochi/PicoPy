import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { EditorHandle } from '../editor/setup';
import { t } from '../i18n';
import { parseIpynb, serializeIpynb } from '../notebook/ipynb';
import {
  type Notebook,
  type OutputChunk,
  newCodeCell,
  newMarkdownCell,
  starterNotebook,
} from '../notebook/model';
import { NotebookView } from '../notebook/NotebookView';
import { Runtime, type RuntimeState } from '../runtime/manager';
import { appendChunk } from './output';
import { ScriptView } from './ScriptView';

const STARTER_SCRIPT = `# Welcome to PicoPy! Press Run ▶ to try this program.

name = input("What's your name? ")
print(f"Hello, {name}! Welcome to Python 🐍")

for i in range(1, 4):
    print(i * "⭐")
`;

type Mode = 'notebook' | 'script';

export function App() {
  const [mode, setMode] = useState<Mode>('notebook');
  const [runtimeState, setRuntimeState] = useState<RuntimeState>({ phase: 'starting' });

  // ——— script mode state ———
  const [scriptChunks, setScriptChunks] = useState<OutputChunk[]>([]);
  const [scriptTruncated, setScriptTruncated] = useState(false);
  const scriptEditorRef = useRef<EditorHandle>();
  const scriptCodeRef = useRef(STARTER_SCRIPT);

  // ——— notebook state ———
  const [notebook, setNotebook] = useState<Notebook>(starterNotebook);
  const [generation, setGeneration] = useState(0); // bumps when a file is loaded
  const [runningCellId, setRunningCellId] = useState<string>();
  const execCounter = useRef(0);
  const queueRef = useRef<string[]>([]);
  /** Where output of the currently executing run should go. */
  const targetRef = useRef<'script' | { cellId: string } | undefined>(undefined);
  const notebookRef = useRef(notebook);
  notebookRef.current = notebook;
  const runtimeStateRef = useRef(runtimeState);
  runtimeStateRef.current = runtimeState;

  const appendToScript = useCallback((kind: OutputChunk['kind'], text: string) => {
    setScriptChunks((prev) => {
      const { chunks, truncated } = appendChunk(prev, kind, text, 400_000);
      if (truncated) setScriptTruncated(true);
      return chunks;
    });
  }, []);

  const updateCell = useCallback(
    (cellId: string, fn: (cell: Notebook['cells'][number]) => Notebook['cells'][number]) => {
      setNotebook((nb) => ({
        ...nb,
        cells: nb.cells.map((c) => (c.id === cellId ? fn(c) : c)),
      }));
    },
    [],
  );

  const appendToCell = useCallback(
    (cellId: string, kind: OutputChunk['kind'], text: string) => {
      updateCell(cellId, (c) =>
        c.type === 'code' ? { ...c, outputs: appendChunk(c.outputs, kind, text).chunks } : c,
      );
    },
    [updateCell],
  );

  const appendOutput = useCallback(
    (kind: OutputChunk['kind'], text: string) => {
      const target = targetRef.current;
      if (target === 'script') appendToScript(kind, text);
      else if (target) appendToCell(target.cellId, kind, text);
    },
    [appendToScript, appendToCell],
  );

  // ——— execution orchestration ———
  const runtime = useMemo(
    () =>
      new Runtime({
        onState: setRuntimeState,
        onOutput: (kind, text) => appendOutput(kind === 'stderr' ? 'stream-err' : 'stream-out', text),
        onRunDone: (_id, ok, error, result) => {
          const target = targetRef.current;
          targetRef.current = undefined;
          if (target === 'script') {
            if (error) appendToScript('error', error.traceback + '\n');
            appendToScript('info', (ok ? t('console.finished') : t('console.stopped')) + '\n');
          } else if (target) {
            if (error) appendToCell(target.cellId, 'error', error.traceback);
            if (!ok && !error) appendToCell(target.cellId, 'info', t('console.stopped'));
            if (ok && result !== undefined) appendToCell(target.cellId, 'result', result);
            execCounter.current += 1;
            const count = execCounter.current;
            updateCell(target.cellId, (c) =>
              c.type === 'code' ? { ...c, execCount: ok || error ? count : null } : c,
            );
            setRunningCellId(undefined);
            startNextQueued();
          }
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    void runtime.start();
  }, [runtime]);

  const startCell = useCallback(
    (cellId: string) => {
      const cell = notebookRef.current.cells.find((c) => c.id === cellId);
      if (!cell || cell.type !== 'code') return false;
      updateCell(cellId, (c) => (c.type === 'code' ? { ...c, outputs: [] } : c));
      const id = runtime.run(cell.source, 'shared');
      if (id === undefined) return false;
      targetRef.current = { cellId };
      setRunningCellId(cellId);
      return true;
    },
    [runtime, updateCell],
  );

  const startNextQueued = useCallback(() => {
    while (queueRef.current.length) {
      const next = queueRef.current.shift()!;
      if (startCell(next)) return;
      // Cell vanished (deleted) or couldn't start — clear its pending marker.
      updateCell(next, (c) => (c.type === 'code' ? { ...c, execCount: null } : c));
    }
  }, [startCell, updateCell]);

  const runCell = useCallback(
    (cellId: string) => {
      if (queueRef.current.includes(cellId) || runningCellId === cellId) return;
      updateCell(cellId, (c) => (c.type === 'code' ? { ...c, execCount: '*' } : c));
      if (runtimeStateRef.current.phase === 'ready' && !targetRef.current) {
        startCell(cellId);
      } else {
        queueRef.current.push(cellId);
      }
    },
    [runningCellId, startCell, updateCell],
  );

  const runAll = useCallback(() => {
    for (const c of notebookRef.current.cells) {
      if (c.type === 'code') runCell(c.id);
    }
  }, [runCell]);

  const runScript = useCallback(() => {
    if (runtimeStateRef.current.phase !== 'ready' || targetRef.current) return;
    setScriptChunks([]);
    setScriptTruncated(false);
    const id = runtime.run(scriptCodeRef.current, 'fresh');
    if (id !== undefined) targetRef.current = 'script';
  }, [runtime]);

  const stopAll = useCallback(() => {
    for (const cellId of queueRef.current) {
      updateCell(cellId, (c) => (c.type === 'code' ? { ...c, execCount: null } : c));
    }
    queueRef.current = [];
    void runtime.stop();
  }, [runtime, updateCell]);

  const restart = useCallback(() => {
    for (const cellId of queueRef.current) {
      updateCell(cellId, (c) => (c.type === 'code' ? { ...c, execCount: null } : c));
    }
    queueRef.current = [];
    execCounter.current = 0;
    setRunningCellId(undefined);
    void runtime.restart(
      runtimeStateRef.current.phase === 'running' || runtimeStateRef.current.phase === 'awaiting-input',
    );
  }, [runtime, updateCell]);

  // ——— notebook edits ———
  const cellActions = useMemo(
    () => ({
      onRun: runCell,
      onChange: (id: string, source: string) => updateCell(id, (c) => ({ ...c, source })),
      onMove: (id: string, dir: -1 | 1) =>
        setNotebook((nb) => {
          const i = nb.cells.findIndex((c) => c.id === id);
          const j = i + dir;
          if (i < 0 || j < 0 || j >= nb.cells.length) return nb;
          const cells = [...nb.cells];
          [cells[i], cells[j]] = [cells[j], cells[i]];
          return { ...nb, cells };
        }),
      onDelete: (id: string) =>
        setNotebook((nb) => ({ ...nb, cells: nb.cells.filter((c) => c.id !== id) })),
      onSetRendered: (id: string, rendered: boolean) =>
        updateCell(id, (c) => (c.type === 'markdown' ? { ...c, rendered } : c)),
      onStdin: (value: string) => {
        appendOutput('stdin-echo', value + '\n');
        void runtime.provideStdin(value);
      },
    }),
    [runCell, updateCell, appendOutput, runtime],
  );

  const addCell = useCallback((type: 'code' | 'markdown') => {
    setNotebook((nb) => ({
      ...nb,
      cells: [...nb.cells, type === 'code' ? newCodeCell() : newMarkdownCell()],
    }));
  }, []);

  // ——— open / save ———
  const fileInputRef = useRef<HTMLInputElement>(null);

  const saveFile = useCallback(() => {
    const isNb = mode === 'notebook';
    const text = isNb
      ? serializeIpynb(notebookRef.current, runtimeStateRef.current.pythonVersion)
      : scriptCodeRef.current;
    const name = isNb ? notebookRef.current.name : t('file.defaultScript');
    const blob = new Blob([text], { type: isNb ? 'application/x-ipynb+json' : 'text/x-python' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [mode]);

  const openFile = useCallback(
    async (file: File) => {
      const text = await file.text();
      if (mode === 'notebook') {
        try {
          setNotebook(parseIpynb(text, file.name));
          setGeneration((g) => g + 1);
        } catch {
          alert(t('error.badNotebook'));
        }
      } else {
        scriptEditorRef.current?.setCode(text);
        scriptCodeRef.current = text;
      }
    },
    [mode],
  );

  // Test/automation hook (also handy for classroom tooling).
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__picopy = {
      setCode: (code: string) => {
        scriptEditorRef.current?.setCode(code);
        scriptCodeRef.current = code;
      },
      getCode: () => scriptCodeRef.current,
      run: runScript,
      setMode,
      loadIpynb: (json: string, name = 'test.ipynb') => {
        setNotebook(parseIpynb(json, name));
        setGeneration((g) => g + 1);
      },
      exportIpynb: () => serializeIpynb(notebookRef.current, runtimeStateRef.current.pythonVersion),
      runAll,
    };
  }, [runScript, runAll]);

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
        <span class="topbar__file">
          {mode === 'notebook' ? notebook.name : t('file.defaultScript')}
        </span>
        <nav class="modeswitch" aria-label={t('mode.label')}>
          <button
            class={`modeswitch__opt ${mode === 'notebook' ? 'modeswitch__opt--on' : ''}`}
            onClick={() => setMode('notebook')}
          >
            {t('mode.notebook')}
          </button>
          <button
            class={`modeswitch__opt ${mode === 'script' ? 'modeswitch__opt--on' : ''}`}
            onClick={() => setMode('script')}
          >
            {t('mode.script')}
          </button>
        </nav>
      </header>

      <div class="actionbar">
        {running ? (
          <button class="btn btn--stop" onClick={stopAll}>
            <span class="btn__icon" aria-hidden="true">
              ⏹
            </span>
            {t('action.stop')}
          </button>
        ) : mode === 'script' ? (
          <button class="btn btn--run" disabled={phase !== 'ready'} onClick={runScript}>
            <span class="btn__icon" aria-hidden="true">
              ▶
            </span>
            {t('action.run')}
          </button>
        ) : (
          <button class="btn btn--run" disabled={phase !== 'ready'} onClick={runAll}>
            <span class="btn__icon" aria-hidden="true">
              ▶
            </span>
            {t('action.runAll')}
          </button>
        )}
        <button class="btn btn--ghost" onClick={() => fileInputRef.current?.click()}>
          {t('action.open')}
        </button>
        <button class="btn btn--ghost" onClick={saveFile}>
          {t('action.save')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={mode === 'notebook' ? '.ipynb' : '.py'}
          hidden
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = '';
            if (file) void openFile(file);
          }}
        />
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
        <button class="iconbtn" title={t('action.restart')} aria-label={t('action.restart')} onClick={restart}>
          ↻
        </button>
      </div>

      {phase === 'failed' && (
        <p class="banner-error">
          {t('console.bootErrorHelp')}
          {runtimeState.bootError ? ` (${runtimeState.bootError})` : ''}
        </p>
      )}

      {mode === 'script' ? (
        <ScriptView
          initialCode={scriptCodeRef.current}
          chunks={scriptChunks}
          truncated={scriptTruncated}
          stdinActive={phase === 'awaiting-input' && targetRef.current === 'script'}
          onStdin={(value) => {
            appendToScript('stdin-echo', value + '\n');
            void runtime.provideStdin(value);
          }}
          onRunShortcut={runScript}
          onChange={(code) => (scriptCodeRef.current = code)}
          editorRef={scriptEditorRef}
        />
      ) : (
        <main class="workspace workspace--notebook">
          <NotebookView
            notebook={notebook}
            generation={generation}
            runningCellId={runningCellId}
            stdinActive={phase === 'awaiting-input'}
            onAddCode={() => addCell('code')}
            onAddText={() => addCell('markdown')}
            {...cellActions}
          />
        </main>
      )}
    </>
  );
}

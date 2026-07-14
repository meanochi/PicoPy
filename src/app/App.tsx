import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { EditorHandle } from '../editor/setup';
import { type WorkspaceFile, fileId, filesStore } from '../files/store';
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
import { Drawer, type SampleRef } from './Drawer';
import { appendChunk } from './output';
import { ScriptView } from './ScriptView';

const STARTER_SCRIPT = `# A Python script: it runs top to bottom, like a recipe.

name = input("What's your name? ")
print(f"Hello, {name}! Welcome to Python 🐍")

for i in range(1, 4):
    print(i * "⭐")
`;

type FileMeta = Omit<WorkspaceFile, 'content'>;

function uniqueName(base: string, ext: string, taken: string[]): string {
  let name = `${base}.${ext}`;
  for (let n = 2; taken.includes(name); n++) name = `${base} ${n}.${ext}`;
  return name;
}

export function App() {
  const [runtimeState, setRuntimeState] = useState<RuntimeState>({ phase: 'starting' });
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [currentFile, setCurrentFile] = useState<FileMeta>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);

  // ——— script state ———
  const [scriptChunks, setScriptChunks] = useState<OutputChunk[]>([]);
  const [scriptTruncated, setScriptTruncated] = useState(false);
  const scriptEditorRef = useRef<EditorHandle>();
  const scriptCodeRef = useRef('');

  // ——— notebook state ———
  const [notebook, setNotebook] = useState<Notebook>({ name: '', cells: [] });
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
  const currentFileRef = useRef(currentFile);
  currentFileRef.current = currentFile;

  const mode: 'notebook' | 'script' = currentFile?.kind === 'py' ? 'script' : 'notebook';

  // ——— autosave ———
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const persistNow = useCallback(async () => {
    const file = currentFileRef.current;
    if (!file) return;
    const content =
      file.kind === 'ipynb'
        ? serializeIpynb(notebookRef.current, runtimeStateRef.current.pythonVersion)
        : scriptCodeRef.current;
    const updated: WorkspaceFile = { ...file, content, updatedAt: Date.now() };
    await filesStore.put(updated);
    setFiles((prev) => {
      const rest = prev.filter((f) => f.id !== file.id);
      const { content: _c, ...meta } = updated;
      return [meta, ...rest];
    });
  }, []);

  const scheduleSave = useCallback(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void persistNow(), 700);
  }, [persistNow]);

  // Notebook edits (cells, outputs, exec counts) all flow through setNotebook;
  // persist a debounced snapshot after each change.
  const firstNotebookRender = useRef(true);
  useEffect(() => {
    if (firstNotebookRender.current) {
      firstNotebookRender.current = false;
      return;
    }
    if (currentFileRef.current?.kind === 'ipynb') scheduleSave();
  }, [notebook, scheduleSave]);

  // ——— output plumbing ———
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
        onAppUpdate: () => setUpdateReady(true),
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

  // ——— file management ———
  const openWorkspaceFile = useCallback((file: WorkspaceFile) => {
    clearTimeout(saveTimer.current);
    const { content, ...meta } = file;
    setCurrentFile(meta);
    if (file.kind === 'ipynb') {
      let nb: Notebook;
      try {
        nb = parseIpynb(content, file.name);
      } catch {
        nb = { name: file.name, cells: [newCodeCell()] };
      }
      setNotebook(nb);
      setGeneration((g) => g + 1);
    } else {
      scriptCodeRef.current = content;
      setScriptChunks([]);
      setScriptTruncated(false);
    }
    setDrawerOpen(false);
  }, []);

  const createFile = useCallback(
    async (kind: 'ipynb' | 'py', name?: string, content?: string) => {
      const taken = (await filesStore.list()).map((f) => f.name);
      const file: WorkspaceFile = {
        id: fileId(),
        kind,
        name: name ?? uniqueName(t('file.untitled'), kind, taken),
        content:
          content ??
          (kind === 'ipynb'
            ? serializeIpynb({ name: '', cells: starterNotebook().cells.slice(0, 1).concat(newCodeCell()) })
            : STARTER_SCRIPT),
        updatedAt: Date.now(),
      };
      await filesStore.put(file);
      const { content: _c, ...meta } = file;
      setFiles((prev) => [meta, ...prev]);
      openWorkspaceFile(file);
    },
    [openWorkspaceFile],
  );

  // Boot: load the workspace; first visit gets the welcome notebook.
  useEffect(() => {
    void (async () => {
      const list = await filesStore.list();
      if (list.length === 0) {
        const nb = starterNotebook();
        const file: WorkspaceFile = {
          id: fileId(),
          kind: 'ipynb',
          name: nb.name,
          content: serializeIpynb(nb),
          updatedAt: Date.now(),
        };
        await filesStore.put(file);
        setFiles([{ id: file.id, kind: file.kind, name: file.name, updatedAt: file.updatedAt }]);
        openWorkspaceFile(file);
      } else {
        setFiles(list.map(({ content: _c, ...meta }) => meta));
        openWorkspaceFile(list[0]);
      }
    })();
  }, [openWorkspaceFile]);

  const openById = useCallback(
    async (id: string) => {
      await persistNow(); // don't lose pending edits of the file being left
      const file = await filesStore.get(id);
      if (file) openWorkspaceFile(file);
    },
    [openWorkspaceFile, persistNow],
  );

  const renameFile = useCallback(
    async (id: string) => {
      const file = await filesStore.get(id);
      if (!file) return;
      const entered = prompt(t('drawer.renamePrompt'), file.name)?.trim();
      if (!entered || entered === file.name) return;
      const name = entered.includes('.') ? entered : `${entered}.${file.kind}`;
      await filesStore.put({ ...file, name, updatedAt: Date.now() });
      setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
      if (currentFileRef.current?.id === id) {
        setCurrentFile((f) => (f ? { ...f, name } : f));
        setNotebook((nb) => ({ ...nb, name }));
      }
    },
    [],
  );

  const duplicateFile = useCallback(async (id: string) => {
    const file = await filesStore.get(id);
    if (!file) return;
    const dot = file.name.lastIndexOf('.');
    const base = dot > 0 ? file.name.slice(0, dot) : file.name;
    const taken = (await filesStore.list()).map((f) => f.name);
    const copy: WorkspaceFile = {
      ...file,
      id: fileId(),
      name: uniqueName(`${base} (${t('drawer.copySuffix')})`, file.kind, taken).replace(
        new RegExp(`\\.${file.kind}\\.${file.kind}$`),
        `.${file.kind}`,
      ),
      updatedAt: Date.now(),
    };
    await filesStore.put(copy);
    const { content: _c, ...meta } = copy;
    setFiles((prev) => [meta, ...prev]);
  }, []);

  const deleteFile = useCallback(
    async (id: string) => {
      const file = files.find((f) => f.id === id);
      if (!file || !confirm(t('drawer.deleteConfirm', { name: file.name }))) return;
      await filesStore.remove(id);
      const rest = files.filter((f) => f.id !== id);
      setFiles(rest);
      if (currentFileRef.current?.id === id) {
        if (rest.length) await openById(rest[0].id);
        else await createFile('ipynb');
      }
    },
    [files, openById, createFile],
  );

  const fileInputRef = useRef<HTMLInputElement>(null);

  const importDeviceFile = useCallback(
    async (file: File) => {
      const text = await file.text();
      const kind: 'ipynb' | 'py' = file.name.endsWith('.py') ? 'py' : 'ipynb';
      if (kind === 'ipynb') {
        try {
          parseIpynb(text, file.name);
        } catch {
          alert(t('error.badNotebook'));
          return;
        }
      }
      await persistNow();
      await createFile(kind, file.name, text);
    },
    [createFile, persistNow],
  );

  const openSample = useCallback(
    async (sample: SampleRef) => {
      try {
        const res = await fetch(new URL(`samples/${sample.path}`, document.baseURI));
        if (!res.ok) return;
        await persistNow();
        await createFile('ipynb', sample.name, await res.text());
      } catch {
        // Offline before first cache — samples simply stay unavailable.
      }
    },
    [createFile, persistNow],
  );

  const downloadFile = useCallback(() => {
    const file = currentFileRef.current;
    if (!file) return;
    const isNb = file.kind === 'ipynb';
    const text = isNb
      ? serializeIpynb(notebookRef.current, runtimeStateRef.current.pythonVersion)
      : scriptCodeRef.current;
    const blob = new Blob([text], { type: isNb ? 'application/x-ipynb+json' : 'text/x-python' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(a.href);
  }, []);

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

  // Test/automation hook (also handy for classroom tooling).
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__picopy = {
      setCode: (code: string) => {
        scriptEditorRef.current?.setCode(code);
        scriptCodeRef.current = code;
      },
      getCode: () => scriptCodeRef.current,
      run: runScript,
      newScript: () => void createFile('py'),
      loadIpynb: (json: string, name = 'test.ipynb') => void createFile('ipynb', name, json),
      exportIpynb: () => serializeIpynb(notebookRef.current, runtimeStateRef.current.pythonVersion),
      runAll,
    };
  }, [runScript, runAll, createFile]);

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
        <button
          class="iconbtn"
          title={t('drawer.title')}
          aria-label={t('drawer.title')}
          onClick={() => setDrawerOpen(true)}
        >
          ☰
        </button>
        <div class="topbar__logo">
          <span class="topbar__mark" aria-hidden="true">
            Py
          </span>
          {t('app.name')}
        </div>
        {currentFile && (
          <button class="topbar__file" onClick={() => void renameFile(currentFile.id)} title={t('drawer.rename')}>
            {currentFile.name}
          </button>
        )}
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
        <button class="btn btn--ghost" onClick={downloadFile}>
          {t('action.download')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".ipynb,.py"
          hidden
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = '';
            if (file) void importDeviceFile(file);
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

      {updateReady && (
        <div class="toast" role="status">
          {t('update.available')}
          <button class="toast__action" onClick={() => location.reload()}>
            {t('update.reload')}
          </button>
        </div>
      )}

      {phase === 'failed' && (
        <p class="banner-error">
          {t('console.bootErrorHelp')}
          {runtimeState.bootError ? ` (${runtimeState.bootError})` : ''}
        </p>
      )}

      <Drawer
        open={drawerOpen}
        files={files}
        currentId={currentFile?.id}
        onClose={() => setDrawerOpen(false)}
        onOpenFile={(id) => void openById(id)}
        onNew={(kind) => void createFile(kind)}
        onRename={(id) => void renameFile(id)}
        onDuplicate={(id) => void duplicateFile(id)}
        onDelete={(id) => void deleteFile(id)}
        onImport={() => fileInputRef.current?.click()}
        onOpenSample={(s) => void openSample(s)}
      />

      {mode === 'script' && currentFile ? (
        <ScriptView
          key={currentFile.id}
          initialCode={scriptCodeRef.current}
          chunks={scriptChunks}
          truncated={scriptTruncated}
          stdinActive={phase === 'awaiting-input' && targetRef.current === 'script'}
          onStdin={(value) => {
            appendToScript('stdin-echo', value + '\n');
            void runtime.provideStdin(value);
          }}
          onRunShortcut={runScript}
          onChange={(code) => {
            scriptCodeRef.current = code;
            scheduleSave();
          }}
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

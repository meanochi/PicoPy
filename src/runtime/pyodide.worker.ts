/// <reference lib="webworker" />
// The Python runtime lives here, off the UI thread, so the page never freezes
// — even on `while True: pass`. The UI stops runaway code by terminating this
// worker and spawning a fresh one (Pyodide reboots from cache in ~a second).
import type { InitMessage, PythonErrorInfo, RunMessage, WorkerIn, WorkerOut } from './protocol';

const post = (m: WorkerOut) => self.postMessage(m);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pyodide: any;
let stdinUrl = '';

/**
 * Streams stdout/stderr to the UI. Python writes arrive as raw bytes; we
 * decode incrementally and throttle postMessage so a tight print loop doesn't
 * flood the UI thread (flush at most every 30ms or every 8KB, whichever first).
 */
class StreamPump {
  private decoder = new TextDecoder();
  private pending = '';
  private lastFlush = 0;

  constructor(private stream: 'stdout' | 'stderr') {}

  write = (buf: Uint8Array): number => {
    this.pending += this.decoder.decode(buf, { stream: true });
    const now = Date.now();
    if (this.pending.length >= 8192 || now - this.lastFlush >= 30) this.flush();
    return buf.length;
  };

  flush() {
    if (this.pending) {
      post({ type: 'stream', stream: this.stream, text: this.pending });
      this.pending = '';
    }
    this.lastFlush = Date.now();
  }
}

const stdout = new StreamPump('stdout');
const stderr = new StreamPump('stderr');
const flushAll = () => {
  stdout.flush();
  stderr.flush();
};

/**
 * Blocking stdin for input(): tell the UI we need a line, then park on a
 * synchronous XHR that the service worker holds open until the user answers.
 * This needs no SharedArrayBuffer, so it works without cross-origin isolation
 * (which GitHub Pages can't provide and which would break Drive's OAuth popup).
 */
function readLine(): string | null {
  flushAll(); // the input() prompt text must reach the console first
  post({ type: 'stdin-request' });
  const xhr = new XMLHttpRequest();
  xhr.open('GET', stdinUrl, false);
  try {
    xhr.send();
  } catch {
    throw new Error(
      'input() is not available: the PicoPy service worker is not active. ' +
        'Try reloading the page.',
    );
  }
  if (xhr.status !== 200) {
    throw new Error('input() is not available in this session. Try reloading the page.');
  }
  const data = JSON.parse(xhr.responseText) as { value?: string; cancelled?: boolean };
  if (data.cancelled || data.value === undefined) return null; // EOF
  return data.value + '\n';
}

async function boot(msg: InitMessage) {
  stdinUrl = msg.stdinUrl;
  try {
    post({ type: 'progress', stage: 'loading' });
    const mod = await import(/* @vite-ignore */ msg.pyodideUrl);
    post({ type: 'progress', stage: 'initializing' });
    pyodide = await mod.loadPyodide({ indexURL: msg.indexUrl });
    pyodide.setStdout({ write: stdout.write });
    pyodide.setStderr({ write: stderr.write });
    pyodide.setStdin({ stdin: readLine, isatty: true });
    const pythonVersion: string = pyodide.runPython('import sys; ".".join(map(str, sys.version_info[:3]))');
    post({ type: 'ready', pythonVersion, pyodideVersion: pyodide.version });
  } catch (err) {
    post({ type: 'boot-error', message: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Turns a raw Pyodide traceback (which starts with internal frames inside the
 * Pyodide bootstrap code) into what a student should see: only frames from
 * their own code, labelled main.py, plus the final error line.
 */
function cleanTraceback(raw: string): PythonErrorInfo {
  const lines = raw.trimEnd().split('\n');
  const summary = lines[lines.length - 1] ?? 'Error';
  const frameRe = /^ {2}File "<exec>", line (\d+)/;
  const firstUserFrame = lines.findIndex((l) => frameRe.test(l));
  let line: number | undefined;
  for (const l of lines) {
    const m = frameRe.exec(l);
    if (m) line = Number(m[1]);
  }
  let kept = firstUserFrame >= 0 ? lines.slice(firstUserFrame) : lines.slice(-1);
  // SyntaxErrors have no user frame but embed the location differently.
  const syntaxLoc = /^ {2}File "<exec>", line (\d+)$/m.exec(raw);
  if (line === undefined && syntaxLoc) line = Number(syntaxLoc[1]);
  const header = firstUserFrame >= 0 ? ['Traceback (most recent call last):'] : [];
  const traceback = [...header, ...kept].join('\n').replaceAll('File "<exec>"', 'File "main.py"');
  return { traceback, summary, line };
}

// Notebook cells share this namespace so they see each other's variables.
// It lives only as long as the worker: Restart/Stop reboots into a clean one.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sharedNs: any;

async function run(msg: RunMessage) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ns: any;
  if (msg.namespace === 'shared') {
    sharedNs ??= pyodide.globals.get('dict')();
    ns = sharedNs;
  } else {
    ns = pyodide.globals.get('dict')();
  }
  try {
    const value = await pyodide.runPythonAsync(msg.code, { globals: ns });
    let result: string | undefined;
    if (value !== undefined) {
      const repr = pyodide.globals.get('repr');
      try {
        result = repr(value);
      } finally {
        repr.destroy();
        if (value && typeof value.destroy === 'function') value.destroy();
      }
    }
    flushAll();
    post({ type: 'done', id: msg.id, ok: true, result });
  } catch (err) {
    flushAll();
    const raw = err instanceof Error ? err.message : String(err);
    post({ type: 'done', id: msg.id, ok: false, error: cleanTraceback(raw) });
  } finally {
    if (msg.namespace === 'fresh') {
      try {
        ns.destroy();
      } catch {
        // Leaked namespace is harmless; the next run gets a fresh one anyway.
      }
    }
  }
}

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  const msg = e.data;
  if (msg.type === 'init') void boot(msg);
  else if (msg.type === 'run') void run(msg);
};

// Message protocol between the UI thread and the Pyodide worker.

export interface InitMessage {
  type: 'init';
  /** Absolute URL of pyodide.mjs (self-hosted under public/pyodide). */
  pyodideUrl: string;
  /** Directory URL Pyodide loads its runtime files from; must end with '/'. */
  indexUrl: string;
  /** Absolute URL the worker blocks on (sync XHR) to receive stdin lines. */
  stdinUrl: string;
}

export interface RunMessage {
  type: 'run';
  id: number;
  code: string;
}

export type WorkerIn = InitMessage | RunMessage;

export interface PythonErrorInfo {
  /** Cleaned traceback: internal Pyodide frames removed, user file renamed. */
  traceback: string;
  /** The final "ValueError: ..." line. */
  summary: string;
  /** 1-based line in the user's code of the deepest user frame, if known. */
  line?: number;
}

export type WorkerOut =
  | { type: 'progress'; stage: 'loading' | 'initializing' }
  | { type: 'ready'; pythonVersion: string; pyodideVersion: string }
  | { type: 'boot-error'; message: string }
  | { type: 'stream'; stream: 'stdout' | 'stderr'; text: string }
  | { type: 'stdin-request' }
  | { type: 'done'; id: number; ok: boolean; error?: PythonErrorInfo };

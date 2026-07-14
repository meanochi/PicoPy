// Main-thread owner of the Python runtime: spawns the Pyodide worker, relays
// its output, and implements Stop as terminate-and-respawn (the only reliable
// way to kill `while True: pass` without SharedArrayBuffer).
import type { PythonErrorInfo, WorkerOut } from './protocol';
import { ensureServiceWorker } from './sw-register';

export type RuntimePhase =
  | 'starting' // worker spawned, Pyodide loading (first time: ~6MB download)
  | 'ready'
  | 'running'
  | 'awaiting-input' // running, blocked on input()
  | 'failed'; // Pyodide could not boot

export interface RuntimeState {
  phase: RuntimePhase;
  pythonVersion?: string;
  bootError?: string;
}

export interface RuntimeEvents {
  onState(state: RuntimeState): void;
  onOutput(kind: 'stdout' | 'stderr', text: string): void;
  onRunDone(ok: boolean, error?: PythonErrorInfo): void;
}

export class Runtime {
  private worker?: Worker;
  private state: RuntimeState = { phase: 'starting' };
  private runId = 0;
  private stdinReplyUrl = new URL('__picopy__/stdin-reply', document.baseURI).href;
  private stdinCancelUrl = new URL('__picopy__/stdin-cancel', document.baseURI).href;

  constructor(private events: RuntimeEvents) {}

  getState(): RuntimeState {
    return this.state;
  }

  async start(): Promise<void> {
    this.setState({ phase: 'starting', pythonVersion: this.state.pythonVersion });
    await ensureServiceWorker();
    this.spawn();
  }

  run(code: string): void {
    if (this.state.phase !== 'ready' || !this.worker) return;
    this.runId += 1;
    this.setState({ ...this.state, phase: 'running' });
    this.worker.postMessage({ type: 'run', id: this.runId, code });
  }

  /** Terminate the runaway worker (releasing any blocked input()) and reboot. */
  async stop(): Promise<void> {
    if (this.state.phase !== 'running' && this.state.phase !== 'awaiting-input') return;
    this.worker?.terminate();
    this.worker = undefined;
    try {
      await fetch(this.stdinCancelUrl, { method: 'POST' });
    } catch {
      // No service worker — nothing was blocked on stdin anyway.
    }
    this.events.onRunDone(false);
    this.setState({ phase: 'starting', pythonVersion: this.state.pythonVersion });
    this.spawn();
  }

  /** Deliver the user's answer to the input() call blocked in the worker. */
  async provideStdin(value: string): Promise<void> {
    if (this.state.phase !== 'awaiting-input') return;
    this.setState({ ...this.state, phase: 'running' });
    await fetch(this.stdinReplyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    });
  }

  private spawn() {
    const indexUrl = new URL('pyodide/', document.baseURI).href;
    this.worker = new Worker(new URL('./pyodide.worker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker.onmessage = (e: MessageEvent<WorkerOut>) => this.handle(e.data);
    this.worker.postMessage({
      type: 'init',
      pyodideUrl: indexUrl + 'pyodide.mjs',
      indexUrl,
      stdinUrl: new URL('__picopy__/stdin', document.baseURI).href,
    });
  }

  private handle(msg: WorkerOut) {
    switch (msg.type) {
      case 'progress':
        break; // phase already 'starting'; stages could refine the chip later
      case 'ready':
        this.setState({ phase: 'ready', pythonVersion: msg.pythonVersion });
        break;
      case 'boot-error':
        this.setState({ phase: 'failed', bootError: msg.message });
        break;
      case 'stream':
        this.events.onOutput(msg.stream, msg.text);
        break;
      case 'stdin-request':
        this.setState({ ...this.state, phase: 'awaiting-input' });
        break;
      case 'done':
        this.setState({ ...this.state, phase: 'ready' });
        this.events.onRunDone(msg.ok, msg.error);
        break;
    }
  }

  private setState(state: RuntimeState) {
    this.state = state;
    this.events.onState(state);
  }
}

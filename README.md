# PicoPy 🐍

A featherweight Python IDE that runs **entirely in your browser** — on iPad,
Android, and PC. Works offline, plays nicely with filtered school networks
(one single domain, no CDNs), and speaks Jupyter. Inspired by Google Colab,
built for people learning Python.

There is no server: Python itself (CPython 3.14 via
[Pyodide](https://pyodide.org)/WebAssembly) runs on your device, inside a Web
Worker so the page never freezes — even on `while True: pass`.

See [PLAN.md](PLAN.md) for the full product and technical plan.

## Status

- ✅ **Phase 1 — Script mode**: editor (CodeMirror 6), Run/Stop, streaming
  console, working `input()`, beginner-friendly tracebacks, fresh globals per
  run.
- ✅ **Phase 2 — Notebook mode**: Colab-style code + text cells, shared
  variables, execution counters, Run all, markdown rendering (sanitized),
  `.ipynb` open/save interchangeable with Jupyter and Colab.
- ✅ **Phase 3 — Files & persistence**: IndexedDB workspace with autosave,
  file drawer (new/rename/duplicate/delete), import from device, download,
  bundled sample notebooks.
- ✅ **Phase 4 — Offline PWA + deployment**: installable to home screen,
  versioned precache of the whole app + Python runtime (works fully offline
  after first visit), update-ready toast, GitHub Actions CI + Pages deploy.
- ✅ **Phase 5 — Google Drive** (optional): connect with Google, save/open
  notebooks in Drive via the minimal-trust `drive.file` scope, sync badges.
  Hidden entirely until an OAuth client id is configured — see
  [docs/drive-setup.md](docs/drive-setup.md).
- ⏳ Phase 6 — Polish (dark mode, shortcuts, a11y)

## Development

```bash
npm install        # also vendors the Pyodide runtime into public/pyodide
npm run dev        # dev server
npm run build      # typecheck + production build into dist/
npm run test:e2e   # Playwright end-to-end tests (builds first: npm run build)
```

If your environment has a pre-installed Chromium, point the tests at it:
`PICOPY_CHROMIUM=/path/to/chromium npm run test:e2e`.

## How the tricky parts work

- **`input()` in the browser** — the runtime worker blocks on a synchronous
  XHR that the service worker (`public/sw.js`) holds open until you type an
  answer. No SharedArrayBuffer, so no cross-origin-isolation headers needed —
  which keeps GitHub Pages hosting and OAuth popups viable.
- **Stop button** — terminates the runtime worker and boots a fresh one from
  cache (~1s). The only reliable way to kill runaway code without SAB.
- **Single domain** — Pyodide is vendored from npm into `public/pyodide` at
  install time (`scripts/vendor-pyodide.mjs`), never loaded from a CDN.

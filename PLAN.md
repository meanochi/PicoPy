# PicoPy — Product & Technical Plan

A featherweight Python IDE that runs anywhere — iPad, Android, PC — works offline,
survives strict internet filters, opens and saves Jupyter notebooks, and optionally
connects to Google Drive. UI inspired by Google Colab: clean, minimal, friendly.

---

## 1. Vision

PicoPy is for **learners**: students taking their first steps in Python. It is not a
professional IDE. It should feel instant, look beautiful, and never get in the way.

**Core promises:**

| Promise | What it means in practice |
|---|---|
| Very lite | First load ≈ a few MB of app + one cached Python runtime download; instant startup afterwards |
| Any device | Runs in the browser: iPad, Android tablets/phones, Chromebooks, PC/Mac. Touch-friendly UI |
| Filter-friendly | Everything served from **one single domain** — no CDNs, no third-party requests (Drive is opt-in). One domain to whitelist |
| Offline | Full PWA: after the first visit, everything works with no internet at all |
| Jupyter native | Opens, edits, runs and saves real `.ipynb` files, interchangeable with Colab/Jupyter |
| Drive optional | Sign in with Google to open/save files in Drive — but never required |
| Base Python only | Full standard library, no package installation. Focused on learning fundamentals |

## 2. Key architectural decision: everything runs in the browser

There is **no server**. PicoPy is a static web app (PWA), and Python itself runs
inside the browser via **Pyodide** (CPython 3.12 compiled to WebAssembly).

This single decision is what delivers almost every requirement at once:

- **Offline** — no server to reach; the service worker caches the whole app + runtime.
- **Internet filters** — only one domain is ever contacted, and only on first load.
- **Any device** — any modern browser works; nothing to install.
- **Free to host & scale** — static files on GitHub Pages; no compute costs, ever.
- **Privacy** — student code never leaves the device (unless they save to Drive).

**Trade-off accepted:** the Python runtime (~12–20 MB compressed) downloads once on
first visit, then lives in the browser cache. On a school network this happens once
per device and is cached thereafter.

## 3. Decisions made (defaults — say the word and I'll change any of them)

The interactive Q&A tool failed, so these were chosen by recommendation:

1. **Editor modes: Notebook + Script.** Colab-style notebook (`.ipynb`) is the primary
   experience; a simple `.py` script editor with a Run button and console is also
   included, since many curricula start with plain scripts.
2. **Libraries: standard library only** for v1 (lightest download, fastest startup on
   tablets). The architecture leaves a clean seam to enable `numpy`/`matplotlib`
   later as an optional "extras" download.
3. **UI language: English first, built i18n-ready.** All UI strings live in one
   translation file from day one, so adding Hebrew (with RTL layout) or any other
   language later is a translation task, not a rewrite.
4. **Hosting: GitHub Pages** from this repo, deployed automatically by GitHub Actions.
   HTTPS (required for PWA + Drive) comes free; one clean URL to whitelist.

## 4. Technology stack

Chosen for minimal weight, mobile friendliness, and zero third-party runtime requests.

| Layer | Choice | Why |
|---|---|---|
| Python runtime | **Pyodide** (self-hosted, vendored into the app — *not* loaded from its CDN) | The standard, battle-tested CPython-in-WASM. Self-hosting keeps the single-domain promise |
| Execution isolation | **Web Worker** | Python runs off the UI thread → the page never freezes on infinite loops; a Stop button can terminate the worker |
| Code editor | **CodeMirror 6** | ~10× lighter than Monaco (VS Code's editor), and crucially it actually works well on iPad/Android touchscreens, which Monaco does not |
| UI framework | **Preact + TypeScript** | React's API at ~4 KB. Enough structure for a notebook UI without framework bloat |
| Build tool | **Vite** | Fast dev server, tiny static output |
| Styling | **Plain CSS with design tokens** (CSS custom properties) | No CSS framework needed; full control of the "lite, clean, attractive" aesthetic; automatic light/dark theming |
| Notebook format | **nbformat v4** read/write (own small module) | `.ipynb` is just JSON — a small, well-tested serializer keeps us Jupyter/Colab-compatible without heavy dependencies |
| Local storage | **IndexedDB** (workspace files) + File System Access API / classic upload-download where unavailable | Files persist across sessions on every platform, including iPad |
| Offline | **Service Worker** (precache app shell + Pyodide runtime) | Full offline after first visit; versioned cache with in-app "update available" prompt |
| Drive integration | **Google Identity Services + Drive API v3**, `drive.file` scope | The modern, consent-friendly way: PicoPy can only touch files the user picks or creates — reassuring for schools |
| Deployment | **GitHub Actions → GitHub Pages** | Push to main = deployed |

## 5. Product design (UI/UX)

Colab-inspired, but even calmer. Design pillars: generous whitespace, one accent
color, soft shadows, rounded cards, no visual noise.

### Layout

```
┌────────────────────────────────────────────────────┐
│  ☰  PicoPy   notebook-name.ipynb          ⚙  ⬤(Drive)│  ← slim top bar
├────────────────────────────────────────────────────┤
│ ▶ Run all   + Code   + Text        Python: Ready ● │  ← action bar
├────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────┐  │
│  │ [▶]  print("hello")                          │  │  ← code cell (card)
│  │      hello                                   │  │  ← output, subtly tinted
│  └──────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────┐  │
│  │  ## Markdown text cell (rendered)            │  │
│  └──────────────────────────────────────────────┘  │
│                    (+ Code | + Text)                │  ← hover/tap insertion
└────────────────────────────────────────────────────┘
```

- **Side drawer (☰):** file list (local workspace + Drive when connected), new
  notebook / new script, samples for beginners.
- **Cells as cards** with a floating Run button, drag handle, and overflow menu
  (move up/down, duplicate, delete) — Colab's exact interaction model.
- **Script mode:** editor on top, console below (stacked vertically on phones,
  side-by-side option on wide screens).
- **Touch first:** 44px minimum tap targets, cell toolbar always visible on touch
  devices (no hover-only actions), works with on-screen keyboards.
- **Status chip** shows runtime state: Loading → Ready → Running (with Stop) — so
  the one-time Pyodide download is communicated honestly.
- **Light & dark themes**, system-aware, one-tap toggle.

### Beginner-focused touches

- `input()` works: pops a small inline prompt under the running cell (essential for
  every "what's your name?" first lesson; Colab does this too).
- Friendly error display: tracebacks shown with the error line highlighted and the
  final error message emphasized.
- Autosave to the local workspace on every change — students never lose work.
- Starter sample notebooks bundled in (offline-available from day one).

## 6. Google Drive integration (optional layer)

- A "Connect Google Drive" button — nothing Google-related loads until tapped.
- Uses the **`drive.file` OAuth scope**: PicoPy sees *only* files the user opens or
  creates through it. Minimal consent screen, minimal trust required.
- Open from Drive (Google Picker) · Save / Save-as to Drive · file badge shows
  sync state (saved locally / saved to Drive / offline — will sync).
- Offline behavior: edits save locally; when back online, a "save to Drive" retry
  is offered. (v1 keeps this manual and predictable; no background sync magic.)
- **Setup required (one-time, ~15 min):** a free Google Cloud project with the Drive
  API enabled and an OAuth client ID. I'll provide a step-by-step guide
  (`docs/drive-setup.md`) when we build this phase.
- Filter note: Drive requires `accounts.google.com` + `www.googleapis.com` to be
  reachable. Everything else in PicoPy works without them.

## 7. Repository structure

```
PicoPy/
├── public/
│   ├── pyodide/            # vendored Pyodide runtime (self-hosted)
│   ├── samples/            # bundled starter notebooks
│   ├── icons/              # PWA icons
│   └── manifest.webmanifest
├── src/
│   ├── app/                # Preact UI: shell, topbar, drawer, settings
│   ├── notebook/           # cell list, code/markdown cells, outputs
│   ├── script/             # script editor + console view
│   ├── editor/             # CodeMirror setup (python mode, themes, touch)
│   ├── runtime/            # Pyodide worker + message protocol + stdin bridge
│   ├── files/              # workspace store (IndexedDB), ipynb serializer,
│   │                       # import/export, autosave
│   ├── drive/              # lazy-loaded Google Drive module
│   ├── i18n/               # strings.en.json + tiny t() helper
│   └── styles/             # design tokens, base styles, themes
├── sw.ts                   # service worker (precache, versioning)
├── docs/                   # drive-setup.md, deployment.md
├── .github/workflows/      # build + deploy to Pages
└── PLAN.md                 # this file
```

## 8. Build phases

Each phase ends with something usable and pushed.

**Phase 1 — Foundation & script mode (the walking skeleton)**
Vite + Preact + TS scaffold · design tokens & app shell · Pyodide vendored and
running in a worker · script editor with Run/Stop, console output, `input()`
support, friendly tracebacks. *Outcome: you can write and run Python on any device.*

**Phase 2 — Notebook mode**
Cell model + `.ipynb` (nbformat 4) serializer · code & markdown cells, per-cell and
Run-all execution with counters `[1]` · cell toolbar (add/move/delete/duplicate) ·
import/export `.ipynb` round-trip verified against Colab and Jupyter.

**Phase 3 — Files & persistence**
IndexedDB workspace with autosave · file drawer (new/rename/delete/duplicate) ·
open from device / save to device · bundled sample notebooks.

**Phase 4 — Offline PWA + deployment**
Service worker precaching app + Pyodide · web manifest (installable to home screen
on iPad/Android) · update-available flow · GitHub Actions deploy to GitHub Pages ·
verify full offline operation.

**Phase 5 — Google Drive**
Lazy-loaded Drive module · sign-in, open via Picker, save/save-as · sync-state
badge · `docs/drive-setup.md` guide for creating the OAuth client.

**Phase 6 — Polish**
Dark mode · keyboard shortcuts (Shift+Enter etc.) · touch refinements on real
iPad/Android · accessibility pass (focus order, contrast, screen-reader labels) ·
performance budget check (app shell < 300 KB gzipped, excluding Python runtime).

## 9. Verification strategy

- **Runtime:** unit tests for the ipynb serializer (round-trip real Colab/Jupyter
  files) and the worker message protocol (Vitest).
- **End-to-end:** Playwright — load app, run a cell, see output; `input()` flow;
  offline reload test (service worker); import/export a notebook.
- **Devices:** manual checklist on iPad Safari, Android Chrome, desktop
  Chrome/Firefox/Edge — touch targets, on-screen keyboard, install-to-home-screen.
- **Filter simulation:** run with all non-app domains blocked and confirm the app
  is fully functional (Drive gracefully disabled).

## 10. Open items (answer whenever — nothing blocks Phase 1)

1. Confirm the four defaults in §3 (notebook+script · stdlib-only · English-first ·
   GitHub Pages).
2. A name check: is **PicoPy** final? (Affects logo, manifest, page title.)
3. For Drive (Phase 5): I'll need you to create the free Google Cloud OAuth client
   — I'll provide exact click-by-click instructions when we get there.

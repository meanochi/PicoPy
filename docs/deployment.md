# Deploying PicoPy

PicoPy builds to plain static files — it can be hosted anywhere that serves
HTTPS. The repo ships with automatic GitHub Pages deployment.

## GitHub Pages (built in)

One-time setup:

1. On GitHub, open **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.

That's it. Every push to `main` runs the test suite and, when green, deploys
to `https://<user>.github.io/<repo>/`.

The app uses relative paths (`base: './'`), so it works at any subpath with
no configuration.

## Any other static host

```bash
npm ci
npm run build
# upload the dist/ folder
```

Requirements for full functionality:

- **HTTPS** (or localhost) — required for the service worker, which powers
  offline mode and Python's `input()`.
- Serve `.wasm` with `Content-Type: application/wasm` (most hosts do).
- No special headers needed — PicoPy deliberately avoids
  cross-origin-isolation requirements.

## For filtered networks (schools)

Everything is served from the single domain you deploy to; PicoPy makes no
requests to CDNs or third parties. Whitelist that one domain and the full
IDE — including the Python runtime — works. Google Drive integration
(optional, Phase 5) additionally needs `accounts.google.com` and
`www.googleapis.com`; without them the Drive button simply stays hidden.

After a device's **first** visit, PicoPy is fully cached and works with no
network at all.

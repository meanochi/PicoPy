// PicoPy service worker: (1) the stdin bridge that lets Python's input()
// block inside the runtime worker, and (2) full-offline precaching of the
// app + Python runtime.
//
// The __PRECACHE__/__VERSION__ placeholders below are filled in by
// scripts/build-sw.mjs after `vite build`. In dev they stay as-is: the
// precache list is empty and the SW only provides the stdin bridge.

/* ————— stdin bridge ————— */

/** Resolvers for stdin requests currently blocked waiting for user input. */
let stdinWaiters = [];

const json = (obj) =>
  new Response(JSON.stringify(obj), { headers: { 'Content-Type': 'application/json' } });

function handleStdin(event, action) {
  if (action === 'stdin') {
    // Hold the runtime worker's synchronous XHR open until the UI replies.
    event.respondWith(new Promise((resolve) => stdinWaiters.push(resolve)));
  } else if (action === 'stdin-reply') {
    event.respondWith(
      event.request.text().then((body) => {
        const waiter = stdinWaiters.shift();
        if (waiter) waiter(new Response(body, { headers: { 'Content-Type': 'application/json' } }));
        return json({ delivered: Boolean(waiter) });
      }),
    );
  } else if (action === 'stdin-cancel') {
    // Stop button / worker restart: release anything blocked on input().
    for (const waiter of stdinWaiters) waiter(json({ cancelled: true }));
    stdinWaiters = [];
    event.respondWith(json({ ok: true }));
  }
}

/* ————— offline precache ————— */

const VERSION = '__VERSION__';
const PRECACHE = self.__PRECACHE__ || [];
const CACHE_NAME = 'picopy-' + VERSION;

const scopeUrl = (path) => new URL(path, self.registration.scope).href;

/**
 * Resilient precache: fetch each file individually with one retry and
 * tolerate stragglers instead of atomic addAll (where one flaky fetch fails
 * the whole install — fatal on unreliable networks). Anything missed here is
 * backfilled by the fetch handler the next time it's requested online.
 */
async function precacheAll() {
  if (!PRECACHE.length) return;
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(
    PRECACHE.map(async (path) => {
      const url = scopeUrl(path);
      if (await cache.match(url)) return;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const resp = await fetch(url, { cache: 'no-cache' });
          if (resp.ok) {
            await cache.put(url, resp);
            return;
          }
        } catch {
          // Retry once; then leave it for on-demand backfill.
        }
      }
    }),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheAll().then(() => self.skipWaiting()));
});

// Lets the app (and tests) ask how complete the offline cache is.
self.addEventListener('message', (event) => {
  if (event.data !== 'picopy-precache-status') return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = (await cache.keys()).length;
      event.source?.postMessage({ type: 'precache-status', cached, total: PRECACHE.length });
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('picopy-') && name !== CACHE_NAME) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const marker = url.pathname.lastIndexOf('/__picopy__/');
  if (marker !== -1) {
    handleStdin(event, url.pathname.slice(marker + '/__picopy__/'.length));
    return;
  }
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      // App navigations serve the cached shell so the app opens offline.
      // ignoreVary: hosts that send `Vary: Origin` (vite preview, some CDNs)
      // would otherwise fail matches for crossorigin-attributed assets, whose
      // page requests carry an Origin header while precache fetches don't.
      const key = event.request.mode === 'navigate' ? scopeUrl('index.html') : event.request;
      const cached = await caches.match(key, { ignoreSearch: true, ignoreVary: true });
      if (cached) return cached;
      const resp = await fetch(event.request);
      // Backfill precache entries that install-time fetches missed.
      if (resp.ok && PRECACHE.some((p) => scopeUrl(p) === url.href)) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(url.href, resp.clone());
      }
      return resp;
    })(),
  );
});

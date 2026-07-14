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

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      if (PRECACHE.length) {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(PRECACHE.map(scopeUrl));
      }
      await self.skipWaiting();
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
      const key = event.request.mode === 'navigate' ? scopeUrl('index.html') : event.request;
      const cached = await caches.match(key, { ignoreSearch: true });
      return cached ?? fetch(event.request);
    })(),
  );
});

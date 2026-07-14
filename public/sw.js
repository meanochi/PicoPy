// PicoPy service worker.
// Phase 1: stdin bridge — lets Python's input() block inside the runtime
// worker without SharedArrayBuffer. The runtime worker parks on a synchronous
// XHR to __picopy__/stdin; we hold that request open until the UI posts the
// user's answer to __picopy__/stdin-reply, then release both.
// Phase 4 will add offline precaching here.

/** Resolvers for stdin requests currently blocked waiting for user input. */
let stdinWaiters = [];

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const json = (obj) =>
  new Response(JSON.stringify(obj), { headers: { 'Content-Type': 'application/json' } });

self.addEventListener('fetch', (event) => {
  const { pathname } = new URL(event.request.url);
  const marker = pathname.lastIndexOf('/__picopy__/');
  if (marker === -1) return; // not ours — let the network handle it
  const action = pathname.slice(marker + '/__picopy__/'.length);

  if (action === 'stdin') {
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
});

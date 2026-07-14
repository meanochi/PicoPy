// Registers the service worker and waits until it controls this page.
// The runtime worker must be spawned *after* control is established: dedicated
// workers inherit their controller at creation time, and without it the stdin
// bridge (and later, offline caching) can't intercept requests.

/** Resolves true once the SW controls the page, false if SW is unavailable. */
export async function ensureServiceWorker(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;
  try {
    await navigator.serviceWorker.register(new URL('sw.js', document.baseURI), {
      type: 'classic',
    });
    if (navigator.serviceWorker.controller) return true;
    // First-ever visit: the fresh SW calls clients.claim(); wait for it.
    return await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(Boolean(navigator.serviceWorker.controller)), 4000);
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => {
          clearTimeout(timer);
          resolve(true);
        },
        { once: true },
      );
    });
  } catch {
    return false;
  }
}

// Picks up a file shared to installed PicoPy via Android's Share sheet (see
// share_target in manifest.webmanifest). The service worker stores the
// shared file's content in a scratch cache and redirects here with
// ?shared=1; we read it once, then clear both the cache entry and the URL
// marker so a later reload doesn't reopen the same file.

export interface SharedFile {
  name: string;
  content: string;
}

export async function consumeSharedFile(): Promise<SharedFile | undefined> {
  if (!new URLSearchParams(location.search).has('shared')) return undefined;
  history.replaceState(null, '', location.pathname);
  if (!('caches' in window)) return undefined;
  try {
    const cache = await caches.open('picopy-share');
    const res = await cache.match('pending-share');
    if (!res) return undefined;
    await cache.delete('pending-share');
    return (await res.json()) as SharedFile;
  } catch {
    return undefined;
  }
}

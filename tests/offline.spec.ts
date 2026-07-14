import { expect, test, type Page } from '@playwright/test';

async function waitForReady(page: Page) {
  await expect(page.locator('.chip')).toContainText('Ready', { timeout: 60_000 });
}

test('app fully works offline after the first visit', async ({ page, context }) => {
  page.on('console', (m) => console.log(`[browser:${m.type()}]`, m.text().slice(0, 200)));
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
  page.on('requestfailed', (r) =>
    console.log('[requestfailed]', r.url().slice(-60), r.failure()?.errorText),
  );
  // First (online) visit: boot Python and let the service worker precache.
  await page.goto('/');
  await waitForReady(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // The page must be *controlled* (not just registered) before offline
  // navigation can be served from the service worker.
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), {
      timeout: 15_000,
    })
    .toBe(true);
  // Give the SW's install-time precache (app + Python runtime) time to finish.
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const keys = await caches.keys();
          const name = keys.find((k) => k.startsWith('picopy-'));
          if (!name) return 0;
          return (await (await caches.open(name)).keys()).length;
        }),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(10);

  // Go offline and reload: the app shell AND the Python runtime must load
  // from cache, and code must still run.
  await context.setOffline(true);
  await page.reload();
  await waitForReady(page);
  await page.getByRole('button', { name: 'Run all' }).click();
  await expect(page.getByTestId('cell-code').first()).toContainText('Hello, notebook!');
  await context.setOffline(false);
});

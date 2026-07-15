import { expect, test, type Page } from '@playwright/test';

// Named 0-* to run first, in the suite's initial fresh browser: launching a
// new Chromium after many WASM-heavy tests is unreliable in sandboxed
// environments (its network service can die at startup, failing every asset
// load with ERR_FAILED), which has nothing to do with the offline logic
// under test here. Note: no test.use() here — distinct fixture options would
// move this spec to a separate worker group that Playwright schedules last.

async function waitForReady(page: Page) {
  await expect(page.locator('.chip')).toContainText('Ready', { timeout: 60_000 });
}

/** First load right after a browser handoff can drop asset requests in
 * sandboxed environments; one reload recovers instantly. */
async function gotoApp(page: Page) {
  await page.goto('/');
  try {
    await expect(page.locator('.chip')).toBeVisible({ timeout: 10_000 });
  } catch {
    await page.reload();
  }
}

test('app fully works offline after the first visit', async ({ page, context }) => {
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
  page.on('requestfailed', (r) =>
    console.log('[requestfailed]', r.url().slice(-60), r.failure()?.errorText),
  );
  // First (online) visit: boot Python and let the service worker precache.
  await gotoApp(page);
  await waitForReady(page);

  // Wait until the precache is COMPLETE (the SW reports its progress; missed
  // files are retried/backfilled, so this converges).
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const reg = await navigator.serviceWorker.ready;
          if (!reg.active) return 'no active worker';
          const status = new Promise<string>((resolve) => {
            navigator.serviceWorker.addEventListener(
              'message',
              (e) => {
                const d = e.data as { type?: string; cached?: number; total?: number };
                resolve(d.type === 'precache-status' ? `${d.cached}/${d.total}` : 'unexpected');
              },
              { once: true },
            );
          });
          reg.active.postMessage('picopy-precache-status');
          return status;
        }),
      { timeout: 45_000, intervals: [1000] },
    )
    .toMatch(/^(\d+)\/\1$/); // cached === total

  // Go offline and reload: the app shell AND the Python runtime must load
  // from cache, and code must still run.
  await context.setOffline(true);
  await page.reload();
  await waitForReady(page);
  await page.getByRole('button', { name: 'Run all' }).click();
  await expect(page.getByTestId('cell-code').first()).toContainText('Hello, notebook!');
  await context.setOffline(false);
});

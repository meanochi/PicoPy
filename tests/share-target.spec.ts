import { expect, test, type Page } from '@playwright/test';

async function waitForReady(page: Page) {
  await expect(page.locator('.chip')).toContainText('Ready', { timeout: 60_000 });
}

test('opens a file shared via the Android share target', async ({ page, context }) => {
  // First visit so the service worker is registered and controlling the page
  // (the share-target POST is intercepted by the SW, same as on a real device).
  await page.goto('/');
  await waitForReady(page);
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 15_000 })
    .toBe(true);

  // Simulate Android's Share sheet: it submits the shared file as a real
  // top-level POST navigation (not a fetch() call) to the share_target
  // action, which the service worker intercepts and redirects from.
  const shareTargetUrl = new URL('share-target/', page.url()).href;
  const navigated = page.waitForURL((url) => url.searchParams.get('shared') === '1');
  await page.evaluate((url) => {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = url;
    form.enctype = 'multipart/form-data';
    const input = document.createElement('input');
    input.type = 'file';
    input.name = 'file';
    const dt = new DataTransfer();
    dt.items.add(new File(['print("shared from android")'], 'homework.py', { type: 'text/x-python' }));
    input.files = dt.files;
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
  }, shareTargetUrl);
  await navigated;

  await waitForReady(page);
  await expect(page.locator('.topbar__file')).toContainText('homework.py');
  await expect(page.locator('.editor-card .cm-content')).toContainText('shared from android');
  // The URL marker is cleared so a reload doesn't reopen the same file.
  await expect.poll(() => new URL(page.url()).searchParams.has('shared')).toBe(false);
});

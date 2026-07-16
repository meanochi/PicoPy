import { expect, test, type Page } from '@playwright/test';

async function waitForReady(page: Page) {
  await expect(page.locator('.chip')).toContainText('Ready', { timeout: 60_000 });
}

// In-memory Drive stand-in injected before the app loads. It implements the
// same transport interface as the real Google client, so these tests exercise
// the app's full Drive flow (connect → save → list → open) without Google.
const mockScript = () => {
  const store = new Map<string, { name: string; content: string; mime: string }>();
  let n = 0;
  (window as never as Record<string, unknown>).__picopyDriveMock = {
    connect: async () => {},
    list: async () =>
      [...store.entries()].map(([id, f]) => ({
        id,
        name: f.name,
        modifiedTime: new Date().toISOString(),
      })),
    download: async (id: string) => store.get(id)!.content,
    upload: async (name: string, content: string, mime: string, existingId?: string) => {
      const id = existingId ?? `drive-${++n}`;
      store.set(id, { name, content, mime });
      return id;
    },
    signOut: () => {},
  };
  (window as never as Record<string, unknown>).__driveStore = store;
};

test('drive section hidden when not configured', async ({ page }) => {
  await page.goto('/');
  await waitForReady(page);
  await page.getByRole('button', { name: 'Files', exact: true }).click();
  await expect(page.getByText('Google Drive')).toHaveCount(0);
});

test('connect, save to Drive, sync badge, and open from Drive', async ({ page }) => {
  await page.addInitScript(mockScript);
  await page.goto('/');
  await waitForReady(page);

  // Connect.
  await page.getByRole('button', { name: 'Files', exact: true }).click();
  await page.getByRole('button', { name: 'Connect Google Drive' }).click();
  await expect(page.getByRole('button', { name: 'Save current file to Drive' })).toBeVisible();

  // Save the welcome notebook to Drive.
  await page.getByRole('button', { name: 'Save current file to Drive' }).click();
  await expect(page.getByText('Up to date on Drive')).toBeVisible();
  const stored = await page.evaluate(() => {
    const store = (window as never as { __driveStore: Map<string, { name: string }> }).__driveStore;
    return [...store.values()].map((f) => f.name);
  });
  expect(stored).toEqual(['welcome.ipynb']);
  // The workspace list shows the cloud badge.
  await expect(page.locator('.drawer__cloud')).toHaveCount(1);

  // Edit a cell → the badge flips to "changes not saved".
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByTestId('cell-code').first().locator('.cm-content').click();
  await page.keyboard.type('# edited\n');
  await page.waitForTimeout(1000); // autosave debounce
  await page.getByRole('button', { name: 'Files', exact: true }).click();
  await expect(page.getByText('Changes not yet saved to Drive')).toBeVisible();

  // Re-save updates the same Drive file (no duplicate).
  await page.getByRole('button', { name: 'Save current file to Drive' }).click();
  await expect(page.getByText('Up to date on Drive')).toBeVisible();
  const count = await page.evaluate(
    () => (window as never as { __driveStore: Map<string, unknown> }).__driveStore.size,
  );
  expect(count).toBe(1);

  // The Drive list shows the file; opening it re-opens the linked local copy
  // (no duplicate workspace entry).
  const driveItems = page.locator('.drawer__list').last().locator('.drawer__file');
  await expect(driveItems).toHaveText([/welcome\.ipynb/]);
  await driveItems.first().click();
  await expect(page.locator('.drawer-backdrop')).toHaveCount(0);
  await expect(page.locator('.topbar__file')).toContainText('welcome.ipynb');
  await page.getByRole('button', { name: 'Files', exact: true }).click();
  // Scoped to the workspace list (the Drive list below shows it too).
  await expect(
    page.locator('.drawer__list').first().locator('.drawer__name', { hasText: 'welcome.ipynb' }),
  ).toHaveCount(1);
});

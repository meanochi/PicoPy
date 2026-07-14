import { expect, test, type Page } from '@playwright/test';

async function waitForReady(page: Page) {
  await expect(page.locator('.chip')).toContainText('Ready', { timeout: 60_000 });
}

async function openDrawer(page: Page) {
  await page.getByRole('button', { name: 'Files', exact: true }).click();
}

/** Drawer file-item tool buttons only enter the a11y tree on hover. */
async function fileTool(page: Page, fileName: string, tool: string) {
  await page.locator('.drawer__item', { hasText: fileName }).first().hover();
  await page.getByRole('button', { name: `${tool} ${fileName}` }).click();
}

const drawerClosed = (page: Page) => expect(page.locator('.drawer-backdrop')).toHaveCount(0);

test('edits autosave and survive a reload', async ({ page }) => {
  await page.goto('/');
  await waitForReady(page);
  // Add a code cell and type into it.
  await page.getByRole('button', { name: '+ Code' }).click();
  const newCell = page.getByTestId('cell-code').last();
  await newCell.locator('.cm-content').click();
  await page.keyboard.type('persisted = "yes"');
  // Wait past the autosave debounce.
  await page.waitForTimeout(1200);

  await page.reload();
  await waitForReady(page);
  await expect(page.getByTestId('cell-code').last()).toContainText('persisted = "yes"');
});

test('drawer creates, renames, and deletes files', async ({ page }) => {
  await page.goto('/');
  await waitForReady(page);

  // Create a second notebook.
  await openDrawer(page);
  await page.getByRole('button', { name: '+ Notebook' }).click();
  await drawerClosed(page);
  await expect(page.locator('.topbar__file')).toContainText('untitled.ipynb');

  // Rename it via the drawer.
  page.once('dialog', (d) => void d.accept('my-project'));
  await openDrawer(page);
  await fileTool(page, 'untitled.ipynb', 'Rename');
  await expect(page.locator('.topbar__file')).toContainText('my-project.ipynb');

  // Delete it; the previous file becomes current again.
  page.once('dialog', (d) => void d.accept());
  await fileTool(page, 'my-project.ipynb', 'Delete');
  await expect(page.locator('.topbar__file')).toContainText('welcome.ipynb');
});

test('sample notebooks import into the workspace and run', async ({ page }) => {
  await page.goto('/');
  await waitForReady(page);
  await openDrawer(page);
  await page.getByRole('button', { name: 'Python basics.ipynb' }).click();
  await drawerClosed(page);
  await expect(page.locator('.topbar__file')).toContainText('Python basics.ipynb');
  await expect(page.getByRole('heading', { name: 'Python basics 🐍' })).toBeVisible();
  // Run the first code cell of the sample.
  await page.getByTestId('cell-code').first().locator('.cell__run').click();
  await expect(page.getByTestId('cell-code').first()).toContainText('Hello, world!');
});

test('switching files preserves each file content', async ({ page }) => {
  await page.goto('/');
  await waitForReady(page);
  // Create a script, edit it, switch to the notebook, and come back.
  await openDrawer(page);
  await page.getByRole('button', { name: '+ Script' }).click();
  await drawerClosed(page);
  await expect(page.locator('.topbar__file')).toContainText('untitled.py');
  await page.evaluate(() => {
    (window as never as { __picopy: { setCode(c: string): void } }).__picopy.setCode('answer = 42');
  });
  await openDrawer(page);
  await page.getByRole('button', { name: 'welcome.ipynb' }).click();
  await drawerClosed(page);
  await expect(page.locator('.topbar__file')).toContainText('welcome.ipynb');
  await expect(page.getByTestId('cell-code').first()).toBeVisible();
  await openDrawer(page);
  await page.getByRole('button', { name: 'untitled.py' }).click();
  await drawerClosed(page);
  await expect(page.locator('.topbar__file')).toContainText('untitled.py');
  await expect(page.locator('.editor-card .cm-content')).toContainText('answer = 42');
});

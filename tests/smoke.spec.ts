import { expect, test, type Page } from '@playwright/test';

// The app exposes window.__picopy for automation; use it to set editor code
// without fighting CodeMirror's DOM.
async function setCode(page: Page, code: string) {
  await page.evaluate((c) => {
    (window as unknown as { __picopy: { setCode(c: string): void } }).__picopy.setCode(c);
  }, code);
}

async function waitForReady(page: Page) {
  await expect(page.locator('.chip')).toContainText('Ready', { timeout: 60_000 });
  // These tests exercise script mode; the app opens in notebook mode.
  await page.getByRole('button', { name: 'Script' }).click();
}

const runButton = (page: Page) => page.getByRole('button', { name: 'Run', exact: true });

test('boots Python and runs a program', async ({ page }) => {
  await page.goto('/');
  await waitForReady(page);
  await setCode(page, 'print(6 * 7)\nprint("done" + "!")');
  await runButton(page).click();
  const console = page.getByTestId('console');
  await expect(console).toContainText('42');
  await expect(console).toContainText('done!');
  await expect(console).toContainText('— finished —');
});

test('input() blocks, accepts an answer, and resumes', async ({ page }) => {
  await page.goto('/');
  await waitForReady(page);
  await setCode(page, 'name = input("Who? ")\nprint(f"Hi {name}, nice to meet you")');
  await runButton(page).click();
  const field = page.getByTestId('stdin-field');
  await expect(field).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('console')).toContainText('Who?');
  await field.fill('Dana');
  await field.press('Enter');
  await expect(page.getByTestId('console')).toContainText('Hi Dana, nice to meet you');
  await expect(page.locator('.chip')).toContainText('Ready');
});

test('errors show a friendly traceback pointing at main.py', async ({ page }) => {
  await page.goto('/');
  await waitForReady(page);
  await setCode(page, 'x = 1\ny = x / 0');
  await runButton(page).click();
  const console = page.getByTestId('console');
  await expect(console).toContainText('ZeroDivisionError');
  await expect(console).toContainText('File "main.py", line 2');
  await expect(console).not.toContainText('/lib/python');
});

test('Stop kills an infinite loop and the runtime recovers', async ({ page }) => {
  await page.goto('/');
  await waitForReady(page);
  await setCode(page, 'while True:\n    pass');
  await runButton(page).click();
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByTestId('console')).toContainText('— stopped —');
  await waitForReady(page);
  // Prove the fresh runtime still works.
  await setCode(page, 'print("alive")');
  await runButton(page).click();
  await expect(page.getByTestId('console')).toContainText('alive');
});

test('runs get fresh globals (no leftover variables)', async ({ page }) => {
  await page.goto('/');
  await waitForReady(page);
  await setCode(page, 'leftover = 123\nprint("first run ok")');
  await runButton(page).click();
  await expect(page.getByTestId('console')).toContainText('first run ok');
  await setCode(page, 'print(leftover)');
  await runButton(page).click();
  await expect(page.getByTestId('console')).toContainText('NameError');
});

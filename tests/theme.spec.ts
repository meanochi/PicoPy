import { expect, test } from '@playwright/test';

test('theme toggle flips dark mode and persists across reloads', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'light'); // headless default
  await page.getByRole('button', { name: 'Switch light/dark theme' }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch light/dark theme' }).click();
  await expect(html).toHaveAttribute('data-theme', 'light');
});

test('Ctrl+S does not open the browser save dialog and keeps working', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.chip')).toContainText('Ready', { timeout: 60_000 });
  await page.keyboard.press('Control+s');
  // The app is still interactive (no native dialog stole focus).
  await page.getByRole('button', { name: 'Files', exact: true }).click();
  await expect(page.getByText('My files')).toBeVisible();
});

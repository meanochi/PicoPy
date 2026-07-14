import { expect, test, type Page } from '@playwright/test';

async function waitForReady(page: Page) {
  await expect(page.locator('.chip')).toContainText('Ready', { timeout: 60_000 });
}

test('starter notebook runs all cells with shared variables', async ({ page }) => {
  await page.goto('/');
  await waitForReady(page);
  await page.getByRole('button', { name: 'Run all' }).click();
  const cells = page.getByTestId('cell-code');
  // Cell 1 prints; cell 2 uses cell 1's variable as an expression result.
  await expect(cells.nth(0)).toContainText('Hello, notebook!');
  await expect(cells.nth(1)).toContainText("'HELLO, NOTEBOOK!'");
  // Execution counters assigned in order.
  await expect(cells.nth(0)).toContainText('[1]');
  await expect(cells.nth(1)).toContainText('[2]');
});

test('errors in a cell show a friendly traceback', async ({ page }) => {
  await page.goto('/');
  await waitForReady(page);
  const nb = {
    cells: [{ cell_type: 'code', source: 'boom', metadata: {} }],
    metadata: {},
    nbformat: 4,
    nbformat_minor: 5,
  };
  await page.evaluate((json) => {
    (window as never as { __picopy: { loadIpynb(j: string): void } }).__picopy.loadIpynb(json);
  }, JSON.stringify(nb));
  await page.getByTestId('cell-code').first().locator('.cell__run').click();
  await expect(page.getByTestId('cell-code').first()).toContainText('NameError');
});

test('ipynb round-trip preserves cells and outputs', async ({ page }) => {
  await page.goto('/');
  await waitForReady(page);
  const original = {
    cells: [
      { id: 'md1', cell_type: 'markdown', source: ['# Title\n', 'Some *text*'], metadata: {} },
      {
        id: 'c1',
        cell_type: 'code',
        source: 'print("round")\n40 + 2',
        metadata: {},
        execution_count: null,
        outputs: [],
      },
    ],
    metadata: {},
    nbformat: 4,
    nbformat_minor: 5,
  };
  await page.evaluate((json) => {
    (window as never as { __picopy: { loadIpynb(j: string): void } }).__picopy.loadIpynb(json);
  }, JSON.stringify(original));
  await page.getByRole('button', { name: 'Run all' }).click();
  await expect(page.getByTestId('cell-code').first()).toContainText('42');

  const exported = JSON.parse(
    await page.evaluate(() =>
      (window as never as { __picopy: { exportIpynb(): string } }).__picopy.exportIpynb(),
    ),
  );
  expect(exported.nbformat).toBe(4);
  expect(exported.cells).toHaveLength(2);
  expect(exported.cells[0].cell_type).toBe('markdown');
  expect(exported.cells[0].source.join('')).toBe('# Title\nSome *text*');
  expect(exported.cells[1].cell_type).toBe('code');
  expect(exported.cells[1].execution_count).toBe(1);
  const outputs = exported.cells[1].outputs;
  expect(outputs.some((o: { output_type: string }) => o.output_type === 'stream')).toBe(true);
  const result = outputs.find(
    (o: { output_type: string }) => o.output_type === 'execute_result',
  );
  expect(result.data['text/plain'].join('')).toBe('42');
  expect(exported.metadata.kernelspec.language).toBe('python');
});

test('markdown cells render safely', async ({ page }) => {
  await page.goto('/');
  await waitForReady(page);
  const nb = {
    cells: [
      {
        cell_type: 'markdown',
        source: '## Safe\n\n<img src=x onerror="window.__pwned=true">**bold**',
        metadata: {},
      },
    ],
    metadata: {},
    nbformat: 4,
    nbformat_minor: 5,
  };
  await page.evaluate((json) => {
    (window as never as { __picopy: { loadIpynb(j: string): void } }).__picopy.loadIpynb(json);
  }, JSON.stringify(nb));
  await expect(page.getByTestId('cell-markdown').getByRole('heading', { name: 'Safe' })).toBeVisible();
  await expect(page.getByTestId('cell-markdown').locator('strong')).toHaveText('bold');
  expect(await page.evaluate(() => (window as never as { __pwned?: boolean }).__pwned)).toBeUndefined();
});

test('input() works inside a notebook cell', async ({ page }) => {
  await page.goto('/');
  await waitForReady(page);
  const nb = {
    cells: [{ cell_type: 'code', source: 'x = input("word? ")\nprint(x * 2)', metadata: {} }],
    metadata: {},
    nbformat: 4,
    nbformat_minor: 5,
  };
  await page.evaluate((json) => {
    (window as never as { __picopy: { loadIpynb(j: string): void } }).__picopy.loadIpynb(json);
  }, JSON.stringify(nb));
  await page.getByTestId('cell-code').first().locator('.cell__run').click();
  const field = page.getByTestId('stdin-field');
  await expect(field).toBeVisible({ timeout: 20_000 });
  await field.fill('ha');
  await field.press('Enter');
  await expect(page.getByTestId('cell-code').first()).toContainText('haha');
});

test('script mode still works via the mode switch', async ({ page }) => {
  await page.goto('/');
  await waitForReady(page);
  await page.getByRole('button', { name: 'Script' }).click();
  await page.evaluate(() => {
    (window as never as { __picopy: { setCode(c: string): void } }).__picopy.setCode('print(2 ** 10)');
  });
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('console')).toContainText('1024');
});

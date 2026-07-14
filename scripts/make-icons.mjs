// One-off icon generator: renders the PicoPy mark with Chromium and saves
// PNGs into public/icons. Re-run only when the logo changes:
//   PICOPY_CHROMIUM=/path/to/chromium node scripts/make-icons.mjs
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/icons');
await mkdir(outDir, { recursive: true });

const page = await (
  await chromium.launch({ executablePath: process.env.PICOPY_CHROMIUM || undefined })
).newPage();

// maskable: safe zone is the inner 80%, so the glyph is smaller.
async function icon(size, file, { maskable = false } = {}) {
  const glyph = Math.round(size * (maskable ? 0.34 : 0.42));
  const radius = maskable ? 0 : Math.round(size * 0.22);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<!doctype html><style>
    html,body{margin:0}
    .tile{width:${size}px;height:${size}px;border-radius:${radius}px;
      background:linear-gradient(135deg,#3b7bff 0%,#2f6fed 55%,#2258c9 100%);
      display:grid;place-items:center}
    .py{font:800 ${glyph}px/1 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
      color:#fff;letter-spacing:-0.03em}
  </style><div class="tile"><span class="py">Py</span></div>`);
  await page.locator('.tile').screenshot({ path: path.join(outDir, file), omitBackground: true });
  console.log(file);
}

await icon(192, 'icon-192.png');
await icon(512, 'icon-512.png');
await icon(512, 'icon-maskable-512.png', { maskable: true });
await icon(180, 'apple-touch-icon.png', { maskable: true }); // iOS crops corners itself
await page.context().browser().close();

// Post-build step: inject the precache manifest (every file Vite emitted,
// including the vendored Pyodide runtime and samples) into dist/sw.js, plus a
// content-hash version so a new deploy invalidates the old cache atomically.
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

const files = (await walk(dist))
  .map((f) => path.relative(dist, f).split(path.sep).join('/'))
  .filter((f) => f !== 'sw.js' && !f.endsWith('.map'));

// Version = hash of all precached file contents (order-stable).
const hash = createHash('sha256');
for (const f of files.sort()) hash.update(f).update(await readFile(path.join(dist, f)));
const version = hash.digest('hex').slice(0, 12);

const swPath = path.join(dist, 'sw.js');
let sw = await readFile(swPath, 'utf8');
sw = sw
  .replace("'__VERSION__'", JSON.stringify(version))
  .replace('self.__PRECACHE__ || []', JSON.stringify(['./', ...files]));
await writeFile(swPath, sw);
console.log(`sw.js: ${files.length} files precached, version ${version}`);

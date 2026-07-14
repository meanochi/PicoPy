// Copies the Pyodide runtime from node_modules into public/pyodide so the app
// serves it from its own origin (single-domain promise: no CDN requests).
// public/pyodide is gitignored; this runs on postinstall and before builds.
import { cp, mkdir, rm, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.dirname(fileURLToPath(import.meta.url));
const dest = path.resolve(root, '../public/pyodide');

const pyodidePkg = path.dirname(require.resolve('pyodide/package.json'));
const files = [
  'pyodide.mjs',
  'pyodide.asm.mjs',
  'pyodide.asm.wasm',
  'python_stdlib.zip',
  'pyodide-lock.json',
];

await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });
for (const f of files) {
  await cp(path.join(pyodidePkg, f), path.join(dest, f));
}
await access(path.join(dest, 'pyodide.asm.wasm'));
console.log(`Vendored Pyodide ${require('pyodide/package.json').version} -> public/pyodide`);

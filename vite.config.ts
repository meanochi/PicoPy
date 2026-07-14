import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// base is './' so the same build works on GitHub Pages subpaths, custom
// domains, or opened from any static host without configuration.
export default defineConfig({
  base: './',
  plugins: [preact()],
  build: {
    target: 'es2022',
    assetsInlineLimit: 8192,
  },
  worker: {
    format: 'es',
  },
});

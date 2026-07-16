// Light/dark theming: follows the system by default; a manual toggle wins and
// is remembered. The effective theme is stamped on <html data-theme> (all
// chrome colors are CSS custom properties) and pushed into live CodeMirror
// instances (syntax colors can't come from CSS variables).
import { setEditorsDark } from '../editor/setup';

const STORAGE_KEY = 'picopy.theme';

function stored(): 'light' | 'dark' | undefined {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : undefined;
  } catch {
    return undefined;
  }
}

const systemDark = () => matchMedia('(prefers-color-scheme: dark)').matches;

export function effectiveDark(): boolean {
  const s = stored();
  return s ? s === 'dark' : systemDark();
}

function apply() {
  const dark = effectiveDark();
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  setEditorsDark(dark);
}

export function initTheme(): void {
  apply();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!stored()) apply();
  });
}

/** Flips the theme and remembers the choice. Returns the new dark state. */
export function toggleTheme(): boolean {
  const next = effectiveDark() ? 'light' : 'dark';
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Not persistable (private mode) — still applies for this session.
  }
  apply();
  return next === 'dark';
}

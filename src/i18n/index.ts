// Minimal i18n: every user-facing string lives in a JSON dictionary so adding
// a language (including RTL ones) later is a translation task, not a rewrite.
import en from './strings.en.json';

type Strings = Record<string, string>;
const dictionaries: Record<string, Strings> = { en };
let current: Strings = dictionaries.en;

export function t(key: keyof typeof en, params?: Record<string, string | number>): string {
  let s = current[key] ?? en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

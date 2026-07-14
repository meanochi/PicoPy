// Shared output-buffer logic for the script console and notebook cells:
// coalesce consecutive chunks of the same kind (streaming arrives in many
// small pieces) and cap total size so runaway print loops can't freeze the UI.
import type { OutputChunk } from '../notebook/model';

export const DEFAULT_OUTPUT_CAP = 200_000;

export function appendChunk(
  chunks: OutputChunk[],
  kind: OutputChunk['kind'],
  text: string,
  cap = DEFAULT_OUTPUT_CAP,
): { chunks: OutputChunk[]; truncated: boolean } {
  const last = chunks[chunks.length - 1];
  const next =
    last && last.kind === kind
      ? [...chunks.slice(0, -1), { kind, text: last.text + text }]
      : [...chunks, { kind, text }];
  let total = next.reduce((n, c) => n + c.text.length, 0);
  let truncated = false;
  while (total > cap && next.length) {
    const first = next[0];
    const excess = total - cap;
    truncated = true;
    if (first.text.length <= excess) {
      next.shift();
      total -= first.text.length;
    } else {
      next[0] = { ...first, text: first.text.slice(excess) };
      total = cap;
    }
  }
  return { chunks: next, truncated };
}

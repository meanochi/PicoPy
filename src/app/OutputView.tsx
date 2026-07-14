// Renders a list of output chunks (console text, errors, results) plus the
// inline prompt shown while the program is blocked on input(). Used by both
// the script console and notebook cells.
import { useEffect, useRef } from 'preact/hooks';
import type { OutputChunk } from '../notebook/model';
import { t } from '../i18n';

const CHUNK_CLASS: Record<OutputChunk['kind'], string | undefined> = {
  'stream-out': undefined,
  'stream-err': 'console__err',
  error: 'console__err',
  result: 'console__result',
  'stdin-echo': 'console__in',
  info: 'console__info',
};

interface Props {
  chunks: OutputChunk[];
  truncated?: boolean;
  stdinActive: boolean;
  onStdin(value: string): void;
  /** Pin scroll to bottom as output streams in (script console). */
  autoScroll?: boolean;
  emptyText?: string;
}

export function OutputView({ chunks, truncated, stdinActive, onStdin, autoScroll, emptyText }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stdinRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chunks, autoScroll]);

  useEffect(() => {
    if (stdinActive) stdinRef.current?.focus();
  }, [stdinActive]);

  const submit = (e: Event) => {
    e.preventDefault();
    const field = stdinRef.current;
    if (!field) return;
    const value = field.value;
    field.value = '';
    onStdin(value);
  };

  return (
    <>
      <div class="console" ref={scrollRef} data-testid="console">
        {chunks.length === 0 && emptyText ? (
          <span class="console__empty">{emptyText}</span>
        ) : (
          <>
            {truncated && <span class="console__info">{t('console.truncated') + '\n'}</span>}
            {chunks.map((c, i) => (
              <span key={i} class={CHUNK_CLASS[c.kind]}>
                {c.text}
              </span>
            ))}
          </>
        )}
      </div>
      {stdinActive && (
        <form class="stdin" onSubmit={submit}>
          <input
            ref={stdinRef}
            class="stdin__field"
            data-testid="stdin-field"
            placeholder={t('input.placeholder')}
            autocomplete="off"
            autocapitalize="off"
            spellcheck={false}
          />
          <button type="submit" class="stdin__send">
            {t('input.send')}
          </button>
        </form>
      )}
    </>
  );
}

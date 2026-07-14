// Markdown rendering for text cells: marked for parsing, DOMPurify so a
// notebook downloaded from elsewhere can't inject script into the app.
import DOMPurify from 'dompurify';
import { marked } from 'marked';

marked.setOptions({ gfm: true, breaks: false });

export function renderMarkdown(source: string): string {
  const html = marked.parse(source, { async: false });
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

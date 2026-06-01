/**
 * @extends-from lib/generation/html-extract.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { createLogger } from '@/lib/logger';

const log = createLogger('HtmlExtract');

/** Extract a full HTML document from an LLM response. */
export function extractHtmlFromLlmResponse(response: string): string | null {
  const doctypeStart = response.indexOf('<!DOCTYPE html>');
  const htmlTagStart = response.indexOf('<html');
  const start = doctypeStart !== -1 ? doctypeStart : htmlTagStart;

  if (start !== -1) {
    const htmlEnd = response.lastIndexOf('</html>');
    if (htmlEnd !== -1) {
      return response.substring(start, htmlEnd + 7);
    }
  }

  const codeBlockMatch = response.match(/```(?:html)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    const content = codeBlockMatch[1].trim();
    if (content.includes('<html') || content.includes('<!DOCTYPE')) {
      return content;
    }
  }

  const trimmed = response.trim();
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    return trimmed;
  }

  log.error('Could not extract HTML from response');
  return null;
}

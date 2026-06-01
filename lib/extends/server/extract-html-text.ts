/**
 * @extends-from lib/server/extract-html-text.ts
 * @fork-branch feat/html-slide-design-workbench
 */
/**
 * Lightweight HTML-to-text converter for LLM consumption.
 * No external dependencies — only regex-based stripping.
 */

export const MAX_HTML_EXTRACT_LENGTH = 15000;

/**
 * Remove blocks of specified tags (and everything inside them).
 */
function removeTagBlocks(html: string, tagNames: string[]): string {
  let result = html;
  for (const tag of tagNames) {
    // Matches <tag ...>...</tag> (case-insensitive, non-greedy)
    const regex = new RegExp(
      `<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`,
      'gi',
    );
    result = result.replace(regex, ' ');
  }
  return result;
}

/**
 * Decode common HTML entities.
 */
function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ');
}

/**
 * Extract readable text from raw HTML.
 *
 * 1. Removes non-content elements (script, style, nav, footer, etc.)
 * 2. Strips remaining HTML tags
 * 3. Decodes common entities
 * 4. Collapses whitespace
 * 5. Truncates to MAX_HTML_EXTRACT_LENGTH
 */
export function extractTextFromHtml(html: string): string {
  if (!html || typeof html !== 'string') return '';

  // 1. Remove whole blocks of non-content tags
  const withoutBlocks = removeTagBlocks(html, [
    'script',
    'style',
    'noscript',
    'iframe',
    'nav',
    'footer',
    'header',
    'aside',
    'svg',
    'canvas',
    'template',
  ]);

  // 2. Strip all remaining HTML tags
  const withoutTags = withoutBlocks.replace(/<[^>]+>/g, ' ');

  // 3. Decode entities
  const decoded = decodeEntities(withoutTags);

  // 4. Collapse whitespace (tabs, newlines, multiple spaces → single space)
  const collapsed = decoded.replace(/\s+/g, ' ').trim();

  // 5. Truncate
  if (collapsed.length <= MAX_HTML_EXTRACT_LENGTH) {
    return collapsed;
  }

  return `${collapsed.slice(0, MAX_HTML_EXTRACT_LENGTH)}…`;
}

/**
 * @extends-from lib/knowledge-base/merge-reference.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { KNOWLEDGE_REFERENCE_MAX_CHARS } from '@/lib/knowledge-base/constants';

export function mergeReferenceSources(
  kbText?: string,
  chapterText?: string,
  maxChars = KNOWLEDGE_REFERENCE_MAX_CHARS,
): string {
  const parts: string[] = [];
  const kb = kbText?.trim();
  const ch = chapterText?.trim();
  if (kb) parts.push(kb);
  if (ch && ch !== kb) parts.push(ch);
  const joined = parts.join('\n\n---\n\n');
  if (joined.length <= maxChars) return joined;
  return `${joined.slice(0, maxChars)}\n…`;
}

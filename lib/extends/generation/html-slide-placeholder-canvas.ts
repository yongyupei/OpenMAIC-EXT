/**
 * @extends-from lib/generation/html-slide-placeholder-canvas.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { nanoid } from 'nanoid';

import type { GeneratedSlideContent } from '@/lib/types/generation';
import type { SceneOutline } from '@/lib/types/generation';
import type { PPTElement } from '@/lib/types/slides';

function escapeText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Minimal canvas thumbnail for HTML motion slides (student classroom + scene list). */
export function buildHtmlSlidePlaceholderContent(outline: SceneOutline): GeneratedSlideContent {
  const title = escapeText(outline.title);
  const subtitle = escapeText(outline.description || 'HTML motion slide');

  const elements: PPTElement[] = [
    {
      id: `text_${nanoid(8)}`,
      type: 'text',
      left: 80,
      top: 120,
      width: 840,
      height: 100,
      content: `<p><strong style="font-size: 32px">${title}</strong></p>`,
      rotate: 0,
      defaultFontName: 'Microsoft YaHei',
      defaultColor: '#1e293b',
    } as PPTElement,
    {
      id: `text_${nanoid(8)}`,
      type: 'text',
      left: 80,
      top: 240,
      width: 840,
      height: 60,
      content: `<p style="font-size: 16px; color: #64748b">${subtitle}</p>`,
      rotate: 0,
      defaultFontName: 'Microsoft YaHei',
      defaultColor: '#64748b',
    } as PPTElement,
  ];

  return {
    elements,
    background: {
      type: 'gradient',
      gradient: {
        type: 'linear',
        rotate: 135,
        colors: [
          { pos: 0, color: '#f8fafc' },
          { pos: 100, color: '#e2e8f0' },
        ],
      },
    },
  };
}

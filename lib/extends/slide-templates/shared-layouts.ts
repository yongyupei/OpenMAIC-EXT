/**
 * @extends-from lib/slide-templates/shared-layouts.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import type { SlideLayoutPreset } from '@/lib/slide-templates/types';

/** Four shared layout presets for all builtin slide template packs (1000×562.5 canvas). */
export const SHARED_BUILTIN_LAYOUTS: SlideLayoutPreset[] = [
  {
    id: 'cover',
    label: 'Cover',
    promptHint:
      'Use for chapter openers or title slides. Place the main title in the large centered title slot; optional subtitle below. Keep background minimal; avoid cluttering the hero area.',
    slots: [
      {
        role: 'title',
        left: 60,
        top: 120,
        width: 880,
        height: 120,
        maxElements: 1,
      },
      {
        role: 'subtitle',
        left: 60,
        top: 260,
        width: 880,
        height: 80,
        maxElements: 1,
      },
    ],
  },
  {
    id: 'title-bullets',
    label: 'Title and bullets',
    promptHint:
      'Use for explanatory slides. Put a short title at the top; place bullet points or short paragraphs in the body slot. Prefer concise bullets over long paragraphs.',
    slots: [
      {
        role: 'title',
        left: 60,
        top: 50,
        width: 880,
        height: 76,
        maxElements: 1,
      },
      {
        role: 'body',
        left: 60,
        top: 150,
        width: 880,
        height: 350,
        maxElements: 8,
      },
    ],
  },
  {
    id: 'two-column',
    label: 'Two column',
    promptHint:
      'Use for text-plus-visual slides. Title at top; body text on the left column; image or diagram on the right. Balance text length with the image area.',
    slots: [
      {
        role: 'title',
        left: 60,
        top: 50,
        width: 880,
        height: 76,
        maxElements: 1,
      },
      {
        role: 'body',
        left: 60,
        top: 150,
        width: 420,
        height: 350,
        maxElements: 6,
      },
      {
        role: 'image',
        left: 520,
        top: 150,
        width: 420,
        height: 300,
        maxElements: 1,
      },
    ],
  },
  {
    id: 'full-bleed-image',
    label: 'Full bleed image',
    promptHint:
      'Use when a single image dominates the slide. Thin title strip at top; large image in the main area; optional caption below the image.',
    slots: [
      {
        role: 'title',
        left: 60,
        top: 20,
        width: 880,
        height: 60,
        maxElements: 1,
      },
      {
        role: 'image',
        left: 60,
        top: 80,
        width: 880,
        height: 380,
        maxElements: 1,
      },
      {
        role: 'caption',
        left: 60,
        top: 470,
        width: 880,
        height: 72,
        maxElements: 1,
      },
    ],
  },
];

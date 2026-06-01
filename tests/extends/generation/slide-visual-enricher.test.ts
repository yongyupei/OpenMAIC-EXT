import { describe, expect, it } from 'vitest';

import { enrichGeneratedSlideContent } from '@/lib/extends/generation/slide-visual-enricher';
import { BUSINESS_NAVY_THEME } from '@/lib/slide-templates/business-builtin-themes';
import { clonePipelineDefaultSlideTheme } from '@/lib/generation/pipeline-default-slide-theme';
import type { SceneOutline } from '@/lib/types/generation';

const outline: SceneOutline = {
  id: 's1',
  type: 'slide',
  title: 'Metrics',
  description: 'Overview',
  keyPoints: ['Speed', 'Quality', 'Cost'],
  order: 1,
  suggestedLayoutId: 'title-bullets',
};

describe('slide-visual-enricher', () => {
  it('adds subtle background, soft panel, and accent line to plain output', () => {
    const plain = {
      elements: [
        {
          id: 'text_1',
          type: 'text' as const,
          left: 72,
          top: 56,
          width: 856,
          height: 76,
          rotate: 0,
          content: '<p style="font-size: 32px;"><strong>Title</strong></p>',
          defaultFontName: 'Microsoft YaHei',
          defaultColor: '#333333',
          textType: 'title' as const,
        },
        {
          id: 'text_2',
          type: 'text' as const,
          left: 72,
          top: 156,
          width: 856,
          height: 130,
          rotate: 0,
          content: '<p style="font-size: 18px;">• One</p>',
          defaultFontName: 'Microsoft YaHei',
          defaultColor: '#333333',
          textType: 'content' as const,
        },
      ],
      background: { type: 'solid' as const, color: '#ffffff' },
    };

    const enriched = enrichGeneratedSlideContent(plain, outline, {
      theme: clonePipelineDefaultSlideTheme(),
    });

    expect(enriched.background?.type).toBe('gradient');
    expect(enriched.elements.filter((el) => el.type === 'shape').length).toBeLessThanOrEqual(2);
    expect(enriched.elements.some((el) => el.type === 'shape' && el.height <= 4)).toBe(true);

    const title = enriched.elements.find((el) => el.id === 'text_1');
    expect(title?.type).toBe('text');
    if (title?.type === 'text') {
      expect(title.defaultColor).toBe('#5b9bd5');
    }
  });

  it('uses dark navy palette for typography normalization', () => {
    const enriched = enrichGeneratedSlideContent(
      {
        elements: [
          {
            id: 'text_1',
            type: 'text' as const,
            left: 72,
            top: 56,
            width: 856,
            height: 76,
            rotate: 0,
            content: '<p style="font-size: 32px;">Title</p>',
            defaultFontName: 'Microsoft YaHei',
            defaultColor: '#333333',
          },
        ],
        background: { type: 'solid', color: BUSINESS_NAVY_THEME.backgroundColor },
      },
      outline,
      { theme: BUSINESS_NAVY_THEME },
    );

    expect(enriched.background?.type).toBe('gradient');
    const title = enriched.elements.find((el) => el.id === 'text_1');
    if (title?.type === 'text') {
      expect(title.defaultColor).toBe('#5b9bd5');
    }
  });
});

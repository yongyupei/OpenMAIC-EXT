import { nanoid } from 'nanoid';

import { clonePipelineDefaultSlideTheme } from '@/lib/generation/pipeline-default-slide-theme';
import { resolveSlideThemeTypography } from '@/lib/slide-templates/theme-typography';
import { postProcessInteractiveHtml } from '@/lib/generation/interactive-post-processor';
import type {
  GeneratedInteractiveContent,
  GeneratedQuizContent,
  GeneratedSlideContent,
  SceneOutline,
} from '@/lib/types/generation';
import type { WidgetType } from '@/lib/types/widgets';
import type { PPTElement } from '@/lib/types/slides';

function escapeInteractiveFallbackText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Minimal text-only fallback — visual enricher adds canvas structure. */
export function buildSlideContentFallback(outline: SceneOutline): GeneratedSlideContent {
  const theme = clonePipelineDefaultSlideTheme();
  const typography = resolveSlideThemeTypography(theme);
  const title = escapeInteractiveFallbackText(outline.title);
  const bulletPoints = (outline.keyPoints?.length ? outline.keyPoints : [outline.description || outline.title])
    .slice(0, 5)
    .map((point) => escapeInteractiveFallbackText(point));
  const bulletHtml = bulletPoints
    .map(
      (point) =>
        `<p style="font-size: 18px; color: ${typography.bodyFontColor};">• ${point}</p>`,
    )
    .join('');

  return {
    background: { type: 'solid', color: theme.backgroundColor },
    elements: [
      {
        id: `text_${nanoid(8)}`,
        type: 'text',
        left: 72,
        top: 56,
        width: 856,
        height: 76,
        content: `<p style="font-size: 32px;"><strong>${title}</strong></p>`,
        rotate: 0,
        defaultFontName: typography.titleFontName,
        defaultColor: typography.titleFontColor,
        textType: 'title',
      } as PPTElement,
      {
        id: `text_${nanoid(8)}`,
        type: 'text',
        left: 72,
        top: 156,
        width: 856,
        height: 130,
        content: bulletHtml,
        rotate: 0,
        defaultFontName: typography.bodyFontName,
        defaultColor: typography.bodyFontColor,
        textType: 'content',
      } as PPTElement,
    ],
    remark: outline.description,
  };
}

export function buildQuizContentFallback(outline: SceneOutline): GeneratedQuizContent {
  const topic = outline.title;
  const keyPoint = outline.keyPoints?.[0] ?? outline.description ?? topic;
  return {
    questions: [
      {
        id: `q_${nanoid(8)}`,
        type: 'single',
        question: `关于「${topic}」，下列哪项最符合本节要点？`,
        options: [
          { value: 'A', label: keyPoint },
          { value: 'B', label: '与本节要点无关' },
          { value: 'C', label: '需要更多上下文才能判断' },
        ],
        answer: ['A'],
        hasAnswer: true,
      },
    ],
  };
}

export function buildInteractiveWidgetFallback(
  outline: SceneOutline,
  widgetType: WidgetType,
): GeneratedInteractiveContent {
  const title = escapeInteractiveFallbackText(outline.title);
  const description = escapeInteractiveFallbackText(
    outline.description || 'Interactive practice for this topic.',
  );
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:system-ui,sans-serif;padding:24px;line-height:1.6">
  <h1 style="margin-top:0">${title}</h1>
  <p>${description}</p>
  <p style="color:#64748b">交互组件自动生成未完成，可在 Studio 中继续编辑本场景。</p>
</body>
</html>`;

  return {
    html: postProcessInteractiveHtml(html),
    widgetType,
    widgetConfig: undefined,
    teacherActions: undefined,
  };
}

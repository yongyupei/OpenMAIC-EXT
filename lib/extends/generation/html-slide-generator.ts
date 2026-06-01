/**
 * @extends-from lib/generation/html-slide-generator.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { createLogger } from '@/lib/logger';
import { extractHtmlFromLlmResponse } from '@/lib/generation/html-extract';
import { buildHtmlSlidePlaceholderContent } from '@/lib/generation/html-slide-placeholder-canvas';
import { postProcessInteractiveHtml } from '@/lib/generation/interactive-post-processor';
import type { SceneContentOptions } from '@/lib/generation/scene-generator';
import { buildPrompt, PROMPT_IDS } from '@/lib/prompts';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import type { GeneratedSlideContent, SceneOutline } from '@/lib/types/generation';
import type { TeacherAction } from '@/lib/types/widgets';

const log = createLogger('HtmlSlideGenerator');

function themeColorsText(
  resolvedTemplate: SceneContentOptions['resolvedTemplate'],
): string {
  const colors = resolvedTemplate?.record.theme.themeColors;
  if (!colors?.length) return 'Use modern blue/purple gradients.';
  return colors.join(', ');
}

async function generateHtmlSlideTeacherActions(
  outline: SceneOutline,
  html: string,
  aiCall: AICallFn,
  languageDirective?: string,
  chapterDesignBrief?: string,
): Promise<TeacherAction[] | undefined> {
  const prompts = buildPrompt(PROMPT_IDS.HTML_SLIDE_ACTIONS, {
    title: outline.title,
    keyPoints: (outline.keyPoints || []).join('\n'),
    description: outline.description,
    htmlExcerpt: html.slice(0, 4000),
    chapterDesignBrief: chapterDesignBrief || '',
    languageDirective: languageDirective || '',
  });
  if (!prompts) return undefined;

  try {
    const response = await aiCall(prompts.system, prompts.user);
    const parsed = parseJsonResponse<{ actions: TeacherAction[] }>(response);
    return parsed?.actions;
  } catch (err) {
    log.warn(`html-slide-actions failed for "${outline.title}":`, err);
    return undefined;
  }
}

function buildFallbackHtml(outline: SceneOutline): string {
  const title = outline.title.replace(/[<>&]/g, '');
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;margin:0;min-height:100vh;background:linear-gradient(135deg,#eef2ff,#fdf4ff);display:flex;align-items:center;justify-content:center;padding:2rem}
.card{background:#fff;border-radius:1rem;padding:2rem;max-width:720px;box-shadow:0 20px 50px rgba(0,0,0,.08)}
[data-step]{opacity:0;transform:translateY(12px);transition:all .6s ease}
[data-step].revealed{opacity:1;transform:none}</style></head>
<body><div class="card"><h1 data-step="title">${title}</h1><p data-step="body">${outline.description || ''}</p></div>
<script>window.addEventListener('message',function(e){var d=e.data;if(d.type==='reveal'&&d.target){document.querySelectorAll(d.target).forEach(function(el){el.classList.add('revealed')})}});</script></body></html>`;
}

export async function generateHtmlSlideContent(
  outline: SceneOutline,
  aiCall: AICallFn,
  options: SceneContentOptions = {},
): Promise<GeneratedSlideContent | null> {
  const placeholder = buildHtmlSlidePlaceholderContent(outline);

  const contentPrompts = buildPrompt(PROMPT_IDS.HTML_SLIDE_CONTENT, {
    title: outline.title,
    description: outline.description,
    keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
    chapterDesignBrief: options.chapterDesignBrief || '',
    researchContext: options.researchContext?.trim() ?? '',
    languageDirective: options.languageDirective || '',
    themeColors: themeColorsText(options.resolvedTemplate),
  });

  if (!contentPrompts) {
    return {
      ...placeholder,
      htmlSlide: { html: postProcessInteractiveHtml(buildFallbackHtml(outline)) },
    };
  }

  let html: string;
  try {
    const response = await aiCall(contentPrompts.system, contentPrompts.user);
    html = extractHtmlFromLlmResponse(response) ?? buildFallbackHtml(outline);
  } catch (err) {
    log.warn(`html-slide-content failed for "${outline.title}":`, err);
    html = buildFallbackHtml(outline);
  }

  const processed = postProcessInteractiveHtml(html);
  const teacherActions = await generateHtmlSlideTeacherActions(
    outline,
    processed,
    aiCall,
    options.languageDirective,
    options.chapterDesignBrief,
  );

  return {
    ...placeholder,
    htmlSlide: {
      html: processed,
      teacherActions,
      aspectRatio: '16:9',
    },
  };
}

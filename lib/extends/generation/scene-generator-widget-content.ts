import { buildPrompt, PROMPT_IDS } from '@/lib/prompts';
import { postProcessInteractiveHtml } from '@/lib/generation/interactive-post-processor';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import type { PromptId } from '@/lib/prompts/types';
import type {
  GeneratedInteractiveContent,
  SceneOutline,
  WidgetOutline,
} from '@/lib/types/generation';
import type { TeacherAction, WidgetConfig, WidgetType } from '@/lib/types/widgets';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import { createLogger } from '@/lib/logger';

import { buildInteractiveWidgetFallback } from './scene-generator-fallbacks';

const log = createLogger('Generation');

export function convertInteractiveConfigToWidget(outline: SceneOutline): SceneOutline {
  const config = outline.interactiveConfig;
  if (!config) {
    log.warn(
      `Interactive outline missing both widget and interactiveConfig, falling back to simulation`,
    );
    return {
      ...outline,
      widgetType: 'simulation' as WidgetType,
      widgetOutline: { concept: outline.title },
    };
  }

  const widgetType = inferWidgetType(
    config.subject || '',
    config.conceptName,
    config.designIdea || '',
  );

  log.info(`Converting interactiveConfig to widget: ${widgetType} for "${outline.title}"`);

  return {
    ...outline,
    widgetType,
    widgetOutline: buildWidgetOutline(widgetType, config),
  };
}

/**
 * Infer widget type from concept characteristics
 */
function inferWidgetType(subject: string, concept: string, designIdea: string): WidgetType {
  const text = (subject + ' ' + concept + ' ' + designIdea).toLowerCase();

  // Rule-based inference
  if (
    /physics|chemistry|力学|化学|运动|反应|force|motion|equilibrium|wave|电路|circuit/.test(text)
  ) {
    return 'simulation';
  }
  if (/programming|code|algorithm|编程|算法|python|javascript|function|代码/.test(text)) {
    return 'code';
  }
  if (/process|workflow|步骤|流程|逻辑|step|flow|系统|system/.test(text)) {
    return 'diagram';
  }
  if (
    /biology|anatomy|cell|molecular|生物|细胞|分子|3d|三维|solar|planet|skeleton|organ/.test(text)
  ) {
    return 'visualization3d';
  }
  if (/game|quiz|practice|练习|游戏|puzzle|match|challenge|挑战/.test(text)) {
    return 'game';
  }

  // Default fallback
  return 'simulation';
}

/**
 * Build widgetOutline from interactiveConfig for backward compatibility
 */
function buildWidgetOutline(
  widgetType: WidgetType,
  config: { conceptName: string; conceptOverview: string; designIdea: string },
): WidgetOutline {
  const base: WidgetOutline = { concept: config.conceptName };

  switch (widgetType) {
    case 'simulation':
      // Try to extract variables from designIdea
      const varMatch = config.designIdea.match(/variables|参数|调整|adjust|slider/i);
      return { ...base, keyVariables: varMatch ? [] : undefined };
    case 'diagram':
      return { ...base, diagramType: 'flowchart' };
    case 'code':
      return { ...base, language: 'python' };
    case 'game':
      return { ...base, gameType: 'quiz' };
    case 'visualization3d':
      return { ...base, visualizationType: 'custom', objects: [] };
    default:
      return base;
  }
}

function extractHtml(response: string): string | null {
  // Strategy 1: Find complete HTML document
  const doctypeStart = response.indexOf('<!DOCTYPE html>');
  const htmlTagStart = response.indexOf('<html');
  const start = doctypeStart !== -1 ? doctypeStart : htmlTagStart;

  if (start !== -1) {
    const htmlEnd = response.lastIndexOf('</html>');
    if (htmlEnd !== -1) {
      return response.substring(start, htmlEnd + 7);
    }
  }

  // Strategy 2: Extract from code block
  const codeBlockMatch = response.match(/```(?:html)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    const content = codeBlockMatch[1].trim();
    if (content.includes('<html') || content.includes('<!DOCTYPE')) {
      return content;
    }
  }

  // Strategy 3: If response itself looks like HTML
  const trimmed = response.trim();
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    return trimmed;
  }

  log.error('Could not extract HTML from response');
  log.error('Response preview:', response.substring(0, 200));
  return null;
}

export async function generateWidgetContent(
  outline: SceneOutline,
  aiCall: AICallFn,
  languageDirective?: string,
  chapterDesignBrief?: string,
  researchContext?: string,
): Promise<GeneratedInteractiveContent | null> {
  const widgetType = outline.widgetType;
  const widgetOutline = outline.widgetOutline;

  if (!widgetType || !widgetOutline) {
    log.warn(`Interactive outline missing widget config, using placeholder interactive scene`);
    return buildInteractiveWidgetFallback(outline, widgetType ?? 'simulation');
  }

  // Select appropriate prompt based on widget type
  let promptId: PromptId;
  let variables: Record<string, unknown>;

  switch (widgetType) {
    case 'simulation':
      promptId = PROMPT_IDS.SIMULATION_CONTENT;
      variables = {
        conceptName: widgetOutline.concept || outline.title,
        conceptOverview: outline.description,
        keyPoints: (outline.keyPoints || []).join('\n'),
        variables: widgetOutline.keyVariables?.join(', ') || '',
        designIdea: '',
        languageDirective: languageDirective || '',
      };
      break;

    case 'diagram':
      promptId = PROMPT_IDS.DIAGRAM_CONTENT;
      variables = {
        title: outline.title,
        diagramType: widgetOutline.diagramType || 'flowchart',
        description: outline.description,
        keyPoints: (outline.keyPoints || []).join('\n'),
        languageDirective: languageDirective || '',
      };
      break;

    case 'code':
      promptId = PROMPT_IDS.CODE_CONTENT;
      variables = {
        title: outline.title,
        programmingLanguage: widgetOutline.language || 'python',
        description: outline.description,
        keyPoints: (outline.keyPoints || []).join('\n'),
        starterCode: '',
        testCases: '', // AI generates appropriate test cases based on challenge
        hints: '', // AI generates progressive hints based on challenge
        languageDirective: languageDirective || '',
      };
      break;

    case 'game':
      promptId = PROMPT_IDS.GAME_CONTENT;
      variables = {
        title: outline.title,
        gameType: widgetOutline.gameType || 'quiz',
        description: outline.description,
        keyPoints: (outline.keyPoints || []).join('\n'),
        scoring: { correctPoints: 10, speedBonus: 5 },
        languageDirective: languageDirective || '',
      };
      break;

    case 'visualization3d':
      promptId = PROMPT_IDS.VISUALIZATION3D_CONTENT;
      variables = {
        title: outline.title,
        visualizationType: widgetOutline.visualizationType || 'custom',
        description: outline.description,
        keyPoints: (outline.keyPoints || []).join('\n'),
        objects: widgetOutline.objects || [],
        interactions: widgetOutline.interactions || [],
        languageDirective: languageDirective || '',
      };
      break;

    default:
      log.warn(`Unknown widget type: ${widgetType}, using placeholder interactive scene`);
      return buildInteractiveWidgetFallback(outline, widgetType);
  }

  const prompts = buildPrompt(promptId, {
    ...variables,
    chapterDesignBrief: chapterDesignBrief || '',
    researchContext: researchContext?.trim() ?? '',
  });
  if (!prompts) {
    log.error(`Failed to build ${widgetType} prompt for: ${outline.title}`);
    return buildInteractiveWidgetFallback(outline, widgetType);
  }

  log.info(`Generating ${widgetType} widget for: ${outline.title}`);
  let response: string;
  try {
    response = await aiCall(prompts.system, prompts.user);
  } catch (error) {
    log.warn(
      `Widget LLM call failed for "${outline.title}", using placeholder interactive scene:`,
      error,
    );
    return buildInteractiveWidgetFallback(outline, widgetType);
  }

  const html = extractHtml(response);

  if (!html) {
    log.error(`Failed to extract HTML from ${widgetType} response for: ${outline.title}`);
    return buildInteractiveWidgetFallback(outline, widgetType);
  }

  // Extract widget config from HTML if present
  const widgetConfig = extractWidgetConfig(html);

  // Generate teacher actions
  const teacherActions = await generateWidgetTeacherActions(
    widgetType,
    outline,
    widgetConfig,
    aiCall,
    languageDirective,
  );
  log.info(
    `[Ultra Mode] Generated ${teacherActions?.length || 0} teacher actions for "${outline.title}" (${widgetType})`,
  );
  if (teacherActions && teacherActions.length > 0) {
    log.info(
      `[Ultra Mode] Teacher actions for "${outline.title}": ${JSON.stringify(teacherActions, null, 2)}`,
    );
  }

  return {
    html: postProcessInteractiveHtml(html),
    widgetType,
    widgetConfig,
    teacherActions,
  };
}

function extractWidgetConfig(html: string): WidgetConfig | undefined {
  const match = html.match(
    /<script type="application\/json" id="widget-config">([\s\S]*?)<\/script>/,
  );
  if (!match) return undefined;

  try {
    return JSON.parse(match[1]);
  } catch {
    return undefined;
  }
}

/**
 * Generate teacher actions for a widget
 */
async function generateWidgetTeacherActions(
  widgetType: WidgetType,
  outline: SceneOutline,
  widgetConfig: WidgetConfig | undefined,
  aiCall: AICallFn,
  languageDirective?: string,
): Promise<TeacherAction[] | undefined> {
  const prompts = buildPrompt(PROMPT_IDS.WIDGET_TEACHER_ACTIONS, {
    widgetType,
    description: outline.description,
    keyPoints: (outline.keyPoints || []).join('\n'),
    widgetConfig: JSON.stringify(widgetConfig || {}),
    languageDirective: languageDirective || '',
  });

  if (!prompts) return undefined;

  try {
    const response = await aiCall(prompts.system, prompts.user);
    const parsed = parseJsonResponse<{ actions: TeacherAction[] }>(response);
    return parsed?.actions;
  } catch {
    return undefined;
  }
}

/** Normalize legacy interactive outlines before widget generation. */
export function prepareInteractiveOutline(outline: SceneOutline): SceneOutline {
  let next = outline;
  if (!next.widgetType && next.interactiveConfig) {
    log.info(`Converting legacy interactiveConfig for: ${next.title}`);
    next = convertInteractiveConfigToWidget(next);
  }
  if (!next.widgetType) {
    log.warn(
      `Interactive outline "${next.title}" has no widgetType, falling back to simulation`,
    );
    return {
      ...next,
      widgetType: 'simulation',
      widgetOutline: { concept: next.title },
    };
  }
  return next;
}

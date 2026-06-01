/**
 * @extends-from lib/teacher/chapter-generation-enrichment.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import type { AICallFn } from '@/lib/generation/pipeline-types';
import { createLogger } from '@/lib/logger';
import { buildSearchQuery } from '@/lib/server/search-query-builder';
import { resolveClassroomWebSearchConfig } from '@/lib/server/web-search-config';
import { formatSearchResultsAsContext, searchWeb } from '@/lib/web-search';
import { mergeReferenceSources } from '@/lib/knowledge-base/merge-reference';
import { resolveKnowledgeMountContext } from '@/lib/knowledge-base/resolve-mount-context';
import { resolveChapterKnowledgeNodeIds } from '@/lib/teacher/chapter-knowledge-mount';
import { readChapterReferenceText } from '@/lib/teacher/chapter-reference';
import {
  buildChapterRequirement,
  buildChapterSceneSearchRequirement,
} from '@/lib/teacher/chapter-generation-input';
import type { CourseChapter, CourseProject } from '@/lib/teacher/course-types';

const log = createLogger('ChapterGenerationEnrichment');

async function runChapterDeepSearch(
  searchRequirement: string,
  referenceText: string | undefined,
  aiCall: AICallFn,
  label: string,
): Promise<string | undefined> {
  if (!searchRequirement.trim()) return undefined;

  const webSearchConfig = resolveClassroomWebSearchConfig({});
  if (!webSearchConfig) {
    log.warn(`Deep search (${label}) skipped: no web search provider configured`);
    return undefined;
  }

  try {
    const searchQuery = await buildSearchQuery(searchRequirement, referenceText, aiCall);
    const searchResult = await searchWeb({
      providerId: webSearchConfig.providerId,
      query: searchQuery.query,
      apiKey: webSearchConfig.apiKey,
      baseUrl: webSearchConfig.baseUrl,
    });
    return formatSearchResultsAsContext(searchResult);
  } catch (error) {
    log.warn(`Chapter deep search (${label}) failed, continuing without search context:`, error);
    return undefined;
  }
}

/** Reference text + web search for scene-outline planning. */
export async function buildChapterOutlineEnrichment(
  project: CourseProject,
  chapter: CourseChapter,
  aiCall: AICallFn,
): Promise<{ pdfText?: string; researchContext?: string }> {
  const effectiveIds = resolveChapterKnowledgeNodeIds(project, chapter);
  const kbCtx = effectiveIds.length
    ? await resolveKnowledgeMountContext(effectiveIds)
    : { referenceText: '' };
  const chapterText = await readChapterReferenceText(project.id, chapter);
  const pdfText = mergeReferenceSources(kbCtx.referenceText, chapterText) || undefined;

  let researchContext: string | undefined;
  if (chapter.deepSearchEnabled) {
    researchContext = await runChapterDeepSearch(
      buildChapterRequirement(project, chapter),
      pdfText,
      aiCall,
      'outline',
    );
  }

  return { pdfText, researchContext };
}

/** Web search tailored to planned scenes — run after sceneOutlines exist. */
export async function buildChapterSceneDeepSearchContext(
  project: CourseProject,
  chapter: CourseChapter,
  referenceText: string | undefined,
  aiCall: AICallFn,
): Promise<string | undefined> {
  if (!chapter.deepSearchEnabled) return undefined;
  if (!chapter.sceneOutlines?.length) return undefined;

  return runChapterDeepSearch(
    buildChapterSceneSearchRequirement(project, chapter),
    referenceText,
    aiCall,
    'scenes',
  );
}

/**
 * @extends-from lib/teacher/chapter-generation-input.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import type { AICallFn } from '@/lib/generation/pipeline-types';
import {
  DESIGN_BRIEF_REFERENCE_MAX_CHARS_DEFAULT,
  DESIGN_BRIEF_REFERENCE_MAX_CHARS_MATERIAL,
} from '@/lib/slide-templates/constants';
import { resolveGenerationMode, resolveSlideTemplate } from '@/lib/slide-templates/resolve';
import type { GenerationMode, ResolvedSlideTemplate } from '@/lib/slide-templates/types';
import type { SlideOutputFormat } from '@/lib/teacher/slide-output-format';
import type { UserRequirements } from '@/lib/types/generation';
import { resolveChapterKnowledgeNodeIds } from '@/lib/teacher/chapter-knowledge-mount';
import { buildChapterOutlineEnrichment } from '@/lib/teacher/chapter-generation-enrichment';
import {
  chapterHasReferenceText,
  countChapterKnowledgeNodeIds,
} from '@/lib/teacher/chapter-reference-material';
import type { CourseChapter, CourseProject } from '@/lib/teacher/course-types';
import { resolveGenerationProfile } from '@/lib/teacher/resolve-generation-profile';

const DESIGN_BRIEF_RESEARCH_MAX_CHARS = 4_000;

/** Reference excerpt limit for design briefs, keyed by generation mode. */
export function designBriefReferenceMaxChars(mode: GenerationMode): number {
  return mode === 'material-driven' || mode === 'hybrid'
    ? DESIGN_BRIEF_REFERENCE_MAX_CHARS_MATERIAL
    : DESIGN_BRIEF_REFERENCE_MAX_CHARS_DEFAULT;
}

/** Primary generation requirement built from workbench chapter fields. */
export function buildChapterRequirement(project: CourseProject, chapter: CourseChapter): string {
  const lines: string[] = [`# Chapter: ${chapter.title.trim() || 'Untitled chapter'}`];

  const summary = chapter.summary?.trim();
  if (summary) {
    lines.push('', '## Chapter summary', summary);
  }

  const objectives = chapter.learningObjectives.map((line) => line.trim()).filter(Boolean);
  if (objectives.length > 0) {
    lines.push('', '## Learning objectives');
    for (const objective of objectives) {
      lines.push(`- ${objective}`);
    }
  }

  const courseOverview = project.overview?.trim() || project.requirements.requirement.trim();
  if (courseOverview) {
    lines.push('', '## Course context', `Course: ${project.title}`, courseOverview);
  }

  lines.push(
    '',
    '## Instruction',
    'Plan and generate instructional scenes for THIS chapter only. Every scene must support the learning objectives above.',
  );

  return lines.join('\n');
}

/** Extra requirement text when generation should follow reference material first. */
export function buildMaterialFirstChapterInstruction(
  generationMode: GenerationMode,
  referenceText: string | undefined,
): string {
  if (!chapterHasReferenceText(referenceText)) return '';
  if (generationMode === 'requirement-driven') return '';

  if (generationMode === 'material-driven') {
    return [
      '',
      '## Material-first generation (required)',
      'Knowledge-base selections and/or chapter reference uploads are the PRIMARY source for this chapter.',
      'Derive scene order, titles, and keyPoints from the reference material structure and claims.',
      'Use chapter objectives and course context only for audience, depth, duration, style, and language—not to replace material content.',
      'Do not invent facts that are not supported by the reference material.',
    ].join('\n');
  }

  return [
    '',
    '## Balanced generation (required)',
    'Honor both the learning objectives and the reference material (knowledge base + uploads).',
    'When they conflict, note the tradeoff in scene descriptions and prefer faithful coverage of the reference material.',
  ].join('\n');
}

/** Search query for scene content generation (after outlines exist). */
export function buildChapterSceneSearchRequirement(
  project: CourseProject,
  chapter: CourseChapter,
): string {
  const lines = [
    buildChapterRequirement(project, chapter),
    '',
    '## Planned instructional scenes',
    'Find up-to-date facts, examples, and explanations to write accurate slide/quiz/interactive content for:',
  ];

  for (const outline of chapter.sceneOutlines ?? []) {
    const keyPoints = (outline.keyPoints ?? []).filter(Boolean).join('; ');
    lines.push(
      `- [${outline.type}] ${outline.title}: ${outline.description || ''}${keyPoints ? ` (${keyPoints})` : ''}`,
    );
  }

  return lines.join('\n');
}

function truncateForDesignBrief(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n…` : text;
}

/** Framing context for outline prompts (course + chapter scope). */
export function buildChapterTeacherContext(project: CourseProject, chapter: CourseChapter): string {
  const lines = [
    'Teacher workbench mode: generate content for a single chapter within a multi-chapter course.',
    `Course title: ${project.title}`,
    `Course overview: ${project.overview ?? project.requirements.requirement}`,
    `Chapter title: ${chapter.title}`,
  ];

  if (chapter.summary?.trim()) {
    lines.push(`Chapter summary: ${chapter.summary.trim()}`);
  }

  const objectives = chapter.learningObjectives.map((line) => line.trim()).filter(Boolean);
  if (objectives.length > 0) {
    lines.push('Chapter learning objectives:');
    for (const objective of objectives) {
      lines.push(`- ${objective}`);
    }
  }

  if (chapter.referenceFiles && chapter.referenceFiles.length > 0) {
    lines.push(
      `Chapter reference uploads: ${chapter.referenceFiles.map((file) => file.name).join(', ')}`,
    );
  }

  const knowledgeIds = resolveChapterKnowledgeNodeIds(project, chapter);
  const chapterOnlyKb = chapter.knowledgeNodeIds?.length ?? 0;
  const courseKb = project.knowledge?.mount.nodeIds?.length ?? 0;
  if (knowledgeIds.length > 0) {
    lines.push(
      `Knowledge-base nodes for generation: ${knowledgeIds.length} file(s)/folder(s) (${chapterOnlyKb} chapter-specific, ${courseKb} from course mount, merged and de-duplicated).`,
    );
  }

  if (chapter.deepSearchEnabled) {
    lines.push(
      'Deep search is enabled: use web search results together with reference materials when planning scenes.',
    );
  }

  lines.push('Generate scene outlines for THIS chapter only.');
  return lines.join('\n');
}

const SLIDE_VISUAL_BRIEF_SUMMARY_MAX = 200;
const SLIDE_VISUAL_BRIEF_OBJECTIVES_MAX = 3;

/**
 * Compact chapter framing for slide-content prompts only.
 * Omits reference excerpts and web search — those stay in outline/actions prompts (upstream-aligned).
 */
export function buildChapterSlideVisualBrief(
  project: CourseProject,
  chapter: CourseChapter,
): string {
  const lines = [
    '## Chapter context (visual scope)',
    `Course: ${project.title}`,
    `Chapter: ${chapter.title}`,
  ];

  const summary = chapter.summary?.trim();
  if (summary) {
    const clipped =
      summary.length > SLIDE_VISUAL_BRIEF_SUMMARY_MAX
        ? `${summary.slice(0, SLIDE_VISUAL_BRIEF_SUMMARY_MAX)}…`
        : summary;
    lines.push(`Summary: ${clipped}`);
  }

  const objectives = chapter.learningObjectives
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, SLIDE_VISUAL_BRIEF_OBJECTIVES_MAX);
  if (objectives.length > 0) {
    lines.push('Align this slide with these objectives:');
    for (const objective of objectives) {
      lines.push(`- ${objective}`);
    }
  }

  lines.push(
    '',
    'Focus on title and scannable bullet text. Decorative slide structure is added automatically after generation.',
  );

  return lines.join('\n');
}

/** Brief injected into per-scene content/action prompts during chapter classroom generation. */
export function buildChapterDesignBrief(
  project: CourseProject,
  chapter: CourseChapter,
  referenceText?: string,
  sceneResearchContext?: string,
  generationMode?: GenerationMode,
): string {
  const referenceMaxChars = designBriefReferenceMaxChars(
    generationMode ?? resolveGenerationMode(project, chapter, referenceText),
  );
  const lines = [
    '## Chapter design brief (teacher workbench)',
    `Course: ${project.title}`,
    `Chapter title: ${chapter.title}`,
  ];

  if (chapter.summary?.trim()) {
    lines.push(`Chapter summary: ${chapter.summary.trim()}`);
  }

  const objectives = chapter.learningObjectives.map((line) => line.trim()).filter(Boolean);
  if (objectives.length > 0) {
    lines.push('Learning objectives:');
    for (const objective of objectives) {
      lines.push(`- ${objective}`);
    }
  }

  if (chapter.referenceFiles && chapter.referenceFiles.length > 0) {
    lines.push(`Reference files: ${chapter.referenceFiles.map((file) => file.name).join(', ')}`);
  }

  const knowledgeCount = countChapterKnowledgeNodeIds(project, chapter);
  if (knowledgeCount > 0) {
    lines.push(`Knowledge-base: ${knowledgeCount} mounted node(s) included for this chapter.`);
  }

  const effectiveMode = generationMode ?? resolveGenerationMode(project, chapter, referenceText);
  if (effectiveMode === 'material-driven' && referenceText?.trim()) {
    lines.push(
      '',
      'Generation mode: material-driven — structure slides from the reference excerpts below; objectives constrain scope only.',
    );
  }

  if (sceneResearchContext?.trim()) {
    lines.push(
      '',
      '### Web search (scene generation)',
      truncateForDesignBrief(sceneResearchContext.trim(), DESIGN_BRIEF_RESEARCH_MAX_CHARS),
    );
  } else if (chapter.deepSearchEnabled) {
    lines.push(
      'Deep search is enabled but returned no scene-stage results — rely on objectives and references.',
    );
  }

  if (referenceText?.trim()) {
    const excerpt =
      referenceText.length > referenceMaxChars
        ? `${referenceText.slice(0, referenceMaxChars)}\n…`
        : referenceText;
    lines.push('', '### Reference material excerpts', excerpt);
  }

  lines.push(
    '',
    'Align slide/quiz/interactive content and narration with the chapter title, summary, and learning objectives.',
  );

  return lines.join('\n');
}

export interface ChapterGenerationInput {
  readonly requirements: UserRequirements;
  readonly teacherContext: string;
  readonly referenceText?: string;
  readonly researchContext?: string;
  readonly designBrief: string;
  readonly generationMode: GenerationMode;
  readonly slideOutputFormat: SlideOutputFormat;
  readonly resolvedTemplate: ResolvedSlideTemplate;
  readonly missingTemplateIds: string[];
}

/** Assembles chapter workbench fields into outline + scene generation inputs. */
export async function prepareChapterGenerationInput(
  project: CourseProject,
  chapter: CourseChapter,
  aiCall: AICallFn,
): Promise<ChapterGenerationInput> {
  const { pdfText: referenceText, researchContext } = await buildChapterOutlineEnrichment(
    project,
    chapter,
    aiCall,
  );

  const profile = resolveGenerationProfile(project, chapter);
  const generationMode =
    chapter.generationMode ??
    project.generationMode ??
    resolveGenerationMode(project, chapter, referenceText);
  const projectForTemplate = {
    ...project,
    generationMode,
    slideTemplateId: profile.slideTemplateId ?? project.slideTemplateId,
  };
  const chapterForTemplate = {
    ...chapter,
    slideTemplateId: chapter.slideTemplateId ?? profile.slideTemplateId,
  };
  const { missingTemplateIds, ...resolvedTemplate } = await resolveSlideTemplate(
    projectForTemplate,
    chapterForTemplate,
    project.id,
  );

  const baseRequirement = buildChapterRequirement(project, chapter);
  const materialInstruction = buildMaterialFirstChapterInstruction(generationMode, referenceText);

  return {
    requirements: {
      ...project.requirements,
      requirement: `${baseRequirement}${materialInstruction}`,
      webSearch: chapter.deepSearchEnabled ?? false,
      slideOutputFormat: profile.slideOutputFormat,
      slideTemplateId: profile.slideTemplateId ?? project.requirements.slideTemplateId,
      generationMode,
    },
    teacherContext: buildChapterTeacherContext(project, chapter),
    referenceText,
    researchContext,
    designBrief: buildChapterDesignBrief(
      project,
      chapter,
      referenceText,
      undefined,
      generationMode,
    ),
    generationMode,
    slideOutputFormat: profile.slideOutputFormat,
    resolvedTemplate,
    missingTemplateIds,
  };
}

/** Design brief + search context for per-scene generation (after outlines exist). */
export function buildChapterSceneGenerationContext(
  project: CourseProject,
  chapter: CourseChapter,
  referenceText: string | undefined,
  sceneResearchContext: string | undefined,
  generationMode?: GenerationMode,
): { designBrief: string; slideVisualBrief: string; researchContext: string } {
  return {
    designBrief: buildChapterDesignBrief(
      project,
      chapter,
      referenceText,
      sceneResearchContext,
      generationMode,
    ),
    slideVisualBrief: buildChapterSlideVisualBrief(project, chapter),
    researchContext: sceneResearchContext?.trim() ?? '',
  };
}

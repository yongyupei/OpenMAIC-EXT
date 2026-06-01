/**
 * @extends-from lib/slide-templates/resolve.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { getBuiltinSlideTemplate } from '@/lib/slide-templates/builtins';
import { BUILTIN_DEFAULT_TEMPLATE_ID } from '@/lib/slide-templates/constants';
import { readProjectSlideTemplate } from '@/lib/slide-templates/project-storage';
import { readGlobalSlideTemplate } from '@/lib/slide-templates/storage';
import type { GenerationMode, ResolvedSlideTemplate, SlideTemplateRecord } from '@/lib/slide-templates/types';
import type { CourseChapter, CourseProject } from '@/lib/teacher/course-types';

type GenerationModeSource = {
  generationMode?: GenerationMode;
};

type SlideTemplateResolvableProject = CourseProject & GenerationModeSource & {
  slideTemplateId?: string;
};

type SlideTemplateResolvableChapter = CourseChapter & GenerationModeSource & {
  slideTemplateId?: string;
};

async function resolveTemplateById(
  projectId: string,
  templateId: string,
): Promise<SlideTemplateRecord | undefined> {
  const builtin = getBuiltinSlideTemplate(templateId);
  if (builtin) {
    return builtin;
  }

  const projectTemplate = await readProjectSlideTemplate(projectId, templateId);
  if (projectTemplate) {
    return projectTemplate;
  }

  return readGlobalSlideTemplate(templateId);
}

export function resolveGenerationMode(
  project: GenerationModeSource,
  chapter: GenerationModeSource,
  referenceText: string | undefined,
): GenerationMode {
  const explicit = chapter.generationMode ?? project.generationMode;
  if (explicit) {
    return explicit;
  }
  return referenceText?.trim() ? 'material-driven' : 'requirement-driven';
}

export async function resolveSlideTemplate(
  project: SlideTemplateResolvableProject,
  chapter: SlideTemplateResolvableChapter,
  projectId: string,
): Promise<ResolvedSlideTemplate & { missingTemplateIds: string[] }> {
  const missingTemplateIds: string[] = [];
  const candidateIds = [chapter.slideTemplateId, project.slideTemplateId].filter(
    Boolean,
  ) as string[];

  for (const templateId of candidateIds) {
    const record = await resolveTemplateById(projectId, templateId);
    if (record) {
      const source: ResolvedSlideTemplate['source'] =
        templateId === chapter.slideTemplateId ? 'chapter' : 'project';
      return { record, source, missingTemplateIds };
    }
    missingTemplateIds.push(templateId);
  }

  const fallback = getBuiltinSlideTemplate(BUILTIN_DEFAULT_TEMPLATE_ID);
  if (!fallback) {
    throw new Error(`Missing builtin slide template: ${BUILTIN_DEFAULT_TEMPLATE_ID}`);
  }

  return {
    record: fallback,
    source: 'builtin',
    missingTemplateIds,
  };
}

/** Resolve a slide template by explicit id (quick generation without project context). */
export async function resolveSlideTemplateById(
  templateId: string | undefined,
): Promise<ResolvedSlideTemplate> {
  if (templateId) {
    const builtin = getBuiltinSlideTemplate(templateId);
    if (builtin) {
      return { record: builtin, source: 'builtin' };
    }

    const global = await readGlobalSlideTemplate(templateId);
    if (global) {
      return { record: global, source: 'builtin' };
    }
  }

  const fallback = getBuiltinSlideTemplate(BUILTIN_DEFAULT_TEMPLATE_ID);
  if (!fallback) {
    throw new Error(`Missing builtin slide template: ${BUILTIN_DEFAULT_TEMPLATE_ID}`);
  }

  return { record: fallback, source: 'builtin' };
}

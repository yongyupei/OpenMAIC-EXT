/**
 * @extends-from app/api/extends/teacher/projects/[projectId]/generation-profile/resolved/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import { buildWorkflowExecutionPlan } from '@/lib/generation/workflow';
import { buildChapterFlowStepDisplays } from '@/lib/teacher/chapter-generation-flow';
import { isValidTeacherProjectId, readTeacherProject } from '@/lib/teacher/course-project-storage';
import {
  listWorkflowPresetsForApi,
  resolveGenerationProfile,
} from '@/lib/teacher/resolve-generation-profile';

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { projectId } = await context.params;

  if (!isValidTeacherProjectId(projectId)) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid teacher project id');
  }

  const project = await readTeacherProject(projectId);
  if (!project) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Teacher project not found');
  }

  const url = new URL(request.url);
  const chapterId = url.searchParams.get('chapterId')?.trim() || undefined;
  const chapter =
    chapterId != null
      ? project.outline?.chapters.find((c) => c.id === chapterId)
      : undefined;

  if (chapterId && !chapter) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Chapter not found');
  }

  const resolved = resolveGenerationProfile(project, chapter);
  const executionPlan = buildWorkflowExecutionPlan(resolved.workflow);
  const flowSteps = buildChapterFlowStepDisplays(resolved.workflow, 'idle');

  return apiSuccess({
    resolved: {
      workflowPresetId: resolved.workflowPresetId,
      workflow: resolved.workflow,
      slideTemplateId: resolved.slideTemplateId,
      generationMode: resolved.generationMode,
      promptOverrides: resolved.promptOverrides,
      revision: resolved.revision,
    },
    executionPlan: executionPlan.map(({ index: _index, ...step }) => step),
    flowSteps,
    presets: listWorkflowPresetsForApi(),
  });
}

/**
 * @extends-from app/api/extends/teacher/projects/[projectId]/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { type NextRequest } from 'next/server';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import type { GenerationMode } from '@/lib/slide-templates/types';
import { applyChapterPatches, type ChapterPatch } from '@/lib/teacher/chapter-diff';
import type { CourseProjectDesignWorkbenchChat } from '@/lib/teacher/design-chat-types';
import { parseDesignWorkbenchChatFromPatchBody } from '@/lib/teacher/design-chat-validation';
import type { CourseProject } from '@/lib/teacher/course-types';
import {
  generationProfileOverrideSchema,
  generationProfileSchema,
} from '@/lib/teacher/generation-profile';
import {
  deleteTeacherProject,
  isValidTeacherProjectId,
  readTeacherProject,
  writeTeacherProject,
} from '@/lib/teacher/course-project-storage';

type ProjectRouteContext = {
  params: Promise<{ projectId: string }>;
};

type ProjectUpdate = Partial<
  Pick<
    CourseProject,
    'title' | 'requirements' | 'targetAudience' | 'durationMinutes' | 'chapterCount'
  >
>;

const UPDATE_FIELDS = [
  'title',
  'requirements',
  'targetAudience',
  'durationMinutes',
  'chapterCount',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function parseProjectUpdateBody(request: NextRequest): Promise<ProjectUpdate | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }

  if (!isRecord(body)) {
    return null;
  }

  const updates: ProjectUpdate = {};
  for (const field of UPDATE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) {
      continue;
    }

    const value = body[field];
    switch (field) {
      case 'title':
      case 'targetAudience':
        if (typeof value !== 'string') {
          return null;
        }
        updates[field] = value;
        break;
      case 'requirements':
        if (!isRecord(value) || typeof value.requirement !== 'string') {
          return null;
        }
        updates.requirements = { requirement: value.requirement };
        break;
      case 'chapterCount':
        if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
          return null;
        }
        updates.chapterCount = value;
        break;
      case 'durationMinutes':
        if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
          return null;
        }
        updates.durationMinutes = value;
        break;
      default: {
        const exhaustiveField: never = field;
        return exhaustiveField;
      }
    }
  }

  return updates;
}

async function getProjectId(context: ProjectRouteContext): Promise<string> {
  const { projectId } = await context.params;
  return projectId;
}

const GENERATION_MODES = new Set<GenerationMode>([
  'material-driven',
  'requirement-driven',
  'hybrid',
]);

interface PatchProjectBody {
  title?: string;
  overview?: string;
  slideTemplateId?: string | null;
  generationMode?: GenerationMode | null;
  generationProfile?: CourseProject['generationProfile'];
  chapters?: ChapterPatch[];
  designWorkbenchChat?: CourseProjectDesignWorkbenchChat;
}

function parseGenerationMode(value: unknown): GenerationMode | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string' || !GENERATION_MODES.has(value as GenerationMode)) {
    return undefined;
  }
  return value as GenerationMode;
}

function parsePatchBody(body: unknown): PatchProjectBody | null {
  if (!isRecord(body)) return null;
  const out: PatchProjectBody = {};
  if ('title' in body) {
    if (typeof body.title !== 'string') return null;
    out.title = body.title;
  }
  if ('overview' in body) {
    if (typeof body.overview !== 'string') return null;
    out.overview = body.overview;
  }
  if ('slideTemplateId' in body) {
    const value = body.slideTemplateId;
    if (value !== null && typeof value !== 'string') return null;
    out.slideTemplateId = value;
  }
  if ('generationMode' in body) {
    const mode = parseGenerationMode(body.generationMode);
    if (mode === undefined && body.generationMode !== null) return null;
    out.generationMode = mode ?? null;
  }
  if ('generationProfile' in body) {
    const parsedProfile = generationProfileSchema.safeParse(body.generationProfile);
    if (!parsedProfile.success) return null;
    out.generationProfile = parsedProfile.data;
  }
  if ('chapters' in body) {
    if (!Array.isArray(body.chapters)) return null;
    const parsed: ChapterPatch[] = [];
    for (const entry of body.chapters) {
      if (
        typeof entry !== 'object' ||
        entry === null ||
        typeof (entry as Record<string, unknown>).id !== 'string' ||
        typeof (entry as Record<string, unknown>).title !== 'string' ||
        !Array.isArray((entry as Record<string, unknown>).learningObjectives)
      ) {
        return null;
      }
      const e = entry as Record<string, unknown>;
      let generationMode: GenerationMode | undefined;
      if ('generationMode' in e) {
        const mode = parseGenerationMode(e.generationMode);
        if (mode === undefined || mode === null) return null;
        generationMode = mode;
      }
      let generationProfileOverride: ChapterPatch['generationProfileOverride'];
      if ('generationProfileOverride' in e) {
        const parsedOverride = generationProfileOverrideSchema.safeParse(
          e.generationProfileOverride,
        );
        if (!parsedOverride.success) return null;
        generationProfileOverride = parsedOverride.data;
      }
      parsed.push({
        id: e.id as string,
        title: e.title as string,
        learningObjectives: (e.learningObjectives as unknown[]).filter(
          (line): line is string => typeof line === 'string',
        ),
        summary: typeof e.summary === 'string' ? (e.summary as string) : undefined,
        deepSearchEnabled:
          typeof e.deepSearchEnabled === 'boolean' ? (e.deepSearchEnabled as boolean) : undefined,
        knowledgeNodeIds: Array.isArray(e.knowledgeNodeIds)
          ? (e.knowledgeNodeIds as unknown[]).filter(
              (id): id is string => typeof id === 'string' && id.trim().length > 0,
            )
          : undefined,
        slideTemplateId:
          typeof e.slideTemplateId === 'string' ? (e.slideTemplateId as string) : undefined,
        generationMode,
        generationProfileOverride,
      });
    }
    out.chapters = parsed;
  }
  if ('designWorkbenchChat' in body) {
    const chat = parseDesignWorkbenchChatFromPatchBody(body.designWorkbenchChat);
    if (!chat) return null;
    out.designWorkbenchChat = chat;
  }
  return out;
}

export async function GET(_request: NextRequest, context: ProjectRouteContext) {
  try {
    const projectId = await getProjectId(context);
    if (!isValidTeacherProjectId(projectId)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid teacher project id');
    }

    const project = await readTeacherProject(projectId);
    if (!project) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Teacher project not found');
    }

    return apiSuccess({ project });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to read teacher project',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function PUT(request: NextRequest, context: ProjectRouteContext) {
  try {
    const projectId = await getProjectId(context);
    if (!isValidTeacherProjectId(projectId)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid teacher project id');
    }

    const project = await readTeacherProject(projectId);
    if (!project) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Teacher project not found');
    }

    const updates = await parseProjectUpdateBody(request);
    if (!updates) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid teacher project update');
    }

    const updatedProject: CourseProject = {
      ...project,
      ...updates,
      id: project.id,
      workflowTemplateId: project.workflowTemplateId,
      createdAt: project.createdAt,
      updatedAt: new Date().toISOString(),
    };
    await writeTeacherProject(updatedProject);

    return apiSuccess({ project: updatedProject });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to update teacher project',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function DELETE(_request: NextRequest, context: ProjectRouteContext) {
  try {
    const projectId = await getProjectId(context);
    if (!isValidTeacherProjectId(projectId)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid teacher project id');
    }

    const deleted = await deleteTeacherProject(projectId);
    if (!deleted) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Teacher project not found');
    }

    return apiSuccess({ projectId });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to delete teacher project',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function PATCH(request: NextRequest, context: ProjectRouteContext) {
  try {
    const projectId = await getProjectId(context);
    if (!isValidTeacherProjectId(projectId)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid teacher project id');
    }

    const project = await readTeacherProject(projectId);
    if (!project) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Teacher project not found');
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid JSON');
    }
    const parsed = parsePatchBody(body);
    if (!parsed) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid PATCH body');
    }

    if (
      parsed.title === undefined &&
      parsed.overview === undefined &&
      parsed.slideTemplateId === undefined &&
      parsed.generationMode === undefined &&
      parsed.generationProfile === undefined &&
      parsed.chapters === undefined &&
      parsed.designWorkbenchChat === undefined
    ) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        400,
        'PATCH body must include at least one of title, overview, slideTemplateId, generationMode, generationProfile, chapters, designWorkbenchChat',
      );
    }

    const updated: CourseProject = { ...project, updatedAt: new Date().toISOString() };
    if (parsed.title !== undefined) updated.title = parsed.title.slice(0, 200);
    if (parsed.overview !== undefined) updated.overview = parsed.overview;
    if (parsed.slideTemplateId !== undefined) {
      if (parsed.slideTemplateId === null) {
        delete updated.slideTemplateId;
      } else {
        updated.slideTemplateId = parsed.slideTemplateId;
      }
    }
    if (parsed.generationMode !== undefined) {
      if (parsed.generationMode === null) {
        delete updated.generationMode;
      } else {
        updated.generationMode = parsed.generationMode;
      }
    }
    if (parsed.generationProfile !== undefined) {
      updated.generationProfile = parsed.generationProfile;
    }
    if (parsed.designWorkbenchChat !== undefined) {
      updated.designWorkbenchChat = parsed.designWorkbenchChat;
    }

    let idMapping: Record<string, string> | undefined;
    if (parsed.chapters !== undefined) {
      const existingChapters = updated.outline?.chapters ?? [];
      const result = applyChapterPatches(existingChapters, parsed.chapters);
      idMapping = Object.keys(result.idMapping).length > 0 ? result.idMapping : undefined;

      updated.outline = {
        projectId: updated.id,
        languageDirective: updated.outline?.languageDirective,
        revision: updated.outline?.revision ?? 1,
        chapters: result.chapters,
      };
      updated.chapterCount = result.chapters.length;

      if (result.deletedIds.length > 0) {
        const deletedSet = new Set(result.deletedIds);
        updated.artifacts = updated.artifacts.filter(
          (artifact) => !deletedSet.has(artifact.chapterId),
        );
        if (updated.generatedScenes) {
          const survivingSceneIds = new Set(updated.artifacts.map((artifact) => artifact.sceneId));
          updated.generatedScenes = updated.generatedScenes.filter((scene) =>
            survivingSceneIds.has(scene.id),
          );
        }
      }
    }

    await writeTeacherProject(updated);
    return apiSuccess(idMapping ? { project: updated, idMapping } : { project: updated });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to patch teacher project',
      error instanceof Error ? error.message : String(error),
    );
  }
}

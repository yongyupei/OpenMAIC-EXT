/**
 * @extends-from app/api/extends/teacher/projects/[projectId]/chapters/[chapterId]/references/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { type NextRequest } from 'next/server';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import {
  CHAPTER_REFERENCE_MAX_FILES,
  deleteChapterReferenceFile,
  findChapterInProject,
  saveChapterReferenceUpload,
} from '@/lib/teacher/chapter-reference';
import {
  isValidTeacherProjectId,
  readTeacherProject,
  writeTeacherProject,
} from '@/lib/teacher/course-project-storage';

type RouteContext = {
  params: Promise<{ projectId: string; chapterId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { projectId, chapterId } = await context.params;
    if (!isValidTeacherProjectId(projectId)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid teacher project id');
    }

    const project = await readTeacherProject(projectId);
    if (!project?.outline) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Teacher project not found');
    }

    const chapter = findChapterInProject(project, chapterId);
    if (!chapter) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Chapter not found');
    }

    const existing = chapter.referenceFiles ?? [];
    if (existing.length >= CHAPTER_REFERENCE_MAX_FILES) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        400,
        `Maximum ${CHAPTER_REFERENCE_MAX_FILES} reference files per chapter`,
      );
    }

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Missing file upload');
    }

    const referenceFile = await saveChapterReferenceUpload(
      projectId,
      chapterId,
      file,
      file.name || 'reference.bin',
      file.type || '',
    );

    const updatedChapters = project.outline.chapters.map((entry) =>
      entry.id === chapterId
        ? { ...entry, referenceFiles: [...(entry.referenceFiles ?? []), referenceFile] }
        : entry,
    );

    await writeTeacherProject({
      ...project,
      outline: { ...project.outline, chapters: updatedChapters },
      updatedAt: new Date().toISOString(),
    });

    return apiSuccess({ referenceFile });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to upload reference file',
      message,
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { projectId, chapterId } = await context.params;
    if (!isValidTeacherProjectId(projectId)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid teacher project id');
    }

    const fileId = request.nextUrl.searchParams.get('fileId')?.trim();
    if (!fileId) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Missing fileId');
    }

    const project = await readTeacherProject(projectId);
    if (!project?.outline) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Teacher project not found');
    }

    const chapter = findChapterInProject(project, chapterId);
    if (!chapter) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Chapter not found');
    }

    const target = (chapter.referenceFiles ?? []).find((file) => file.id === fileId);
    if (!target) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Reference file not found');
    }

    await deleteChapterReferenceFile(projectId, chapterId, target.id, target.name);

    const updatedChapters = project.outline.chapters.map((entry) =>
      entry.id === chapterId
        ? {
            ...entry,
            referenceFiles: (entry.referenceFiles ?? []).filter((file) => file.id !== fileId),
          }
        : entry,
    );

    await writeTeacherProject({
      ...project,
      outline: { ...project.outline, chapters: updatedChapters },
      updatedAt: new Date().toISOString(),
    });

    return apiSuccess({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to delete reference file',
      message,
    );
  }
}

/**
 * @extends-from lib/teacher/course-publish.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import type { CourseProject } from '@/lib/teacher/course-types';
import type { Scene, Stage } from '@/lib/types/stage';

type PublishValidationResult = { ok: true } | { ok: false; reason: string; statusCode: 400 | 409 };

const PUBLISHABLE_PROJECT_STATUSES = new Set<CourseProject['status']>(['editing', 'published']);

export function buildStageFromTeacherProject(
  project: CourseProject,
  _scenes: Scene[],
  now: number,
): Stage {
  return {
    id: project.id,
    name: project.title,
    description: project.requirements.requirement,
    createdAt: new Date(project.createdAt).getTime(),
    updatedAt: now,
    languageDirective: project.outline?.languageDirective,
  };
}

/** True when at least one ready chapter has generated scene payloads to preview. */
export function hasPreviewableGeneratedContent(project: CourseProject): boolean {
  return getPublishableScenes(project).length > 0;
}

export function getPublishableScenes(project: CourseProject): Scene[] {
  if (project.artifacts.length === 0) {
    return [];
  }

  if (project.outline) {
    const scenesById = new Map((project.generatedScenes ?? []).map((scene) => [scene.id, scene]));
    const artifactsByOutlineId = new Map(
      project.artifacts.map((artifact) => [artifact.sourceOutlineId, artifact]),
    );
    const scenes: Scene[] = [];

    for (const chapter of project.outline.chapters) {
      if (chapter.status !== 'ready') {
        continue;
      }
      for (const sceneOutline of chapter.sceneOutlines) {
        const artifact = artifactsByOutlineId.get(sceneOutline.id);
        const scene = artifact ? scenesById.get(artifact.sceneId) : undefined;
        if (scene) {
          scenes.push({ ...scene, order: scenes.length });
        }
      }
    }

    return scenes;
  }

  const artifactSceneIds = new Set(project.artifacts.map((artifact) => artifact.sceneId));
  return (project.generatedScenes ?? [])
    .filter((scene) => artifactSceneIds.has(scene.id))
    .sort((left, right) => left.order - right.order)
    .map((scene, order) => ({ ...scene, order }));
}

export function validateTeacherProjectPublishable(project: CourseProject): PublishValidationResult {
  if (!PUBLISHABLE_PROJECT_STATUSES.has(project.status)) {
    return {
      ok: false,
      statusCode: 409,
      reason: 'Teacher project must be in editing or published status before publishing',
    };
  }

  if (project.artifacts.length === 0) {
    return {
      ok: false,
      statusCode: 400,
      reason: 'Generated artifacts are required before publishing',
    };
  }

  const scenes = getPublishableScenes(project);
  const readyChapterIds = new Set(
    (project.outline?.chapters ?? [])
      .filter((chapter) => chapter.status === 'ready')
      .map((chapter) => chapter.id),
  );
  const publishableArtifactSceneIds = new Set(
    project.artifacts
      .filter((artifact) => (project.outline ? readyChapterIds.has(artifact.chapterId) : true))
      .map((artifact) => artifact.sceneId),
  );
  const outlineResult = validateOutlineCompleteness(project, scenes);
  if (!outlineResult.ok) {
    return outlineResult;
  }

  if (scenes.length === 0) {
    return {
      ok: false,
      statusCode: 400,
      reason: 'At least one ready chapter with generated scenes is required before publishing',
    };
  }

  if (scenes.length !== publishableArtifactSceneIds.size) {
    return {
      ok: false,
      statusCode: 400,
      reason: 'Generated scene content is required before publishing',
    };
  }

  const invalidScene = scenes.find((scene) => scene.stageId !== project.id);
  if (invalidScene) {
    return {
      ok: false,
      statusCode: 400,
      reason: 'Generated scene stage id mismatch',
    };
  }

  return validateSceneContents(scenes);
}

function validateOutlineCompleteness(
  project: CourseProject,
  scenes: Scene[],
): PublishValidationResult {
  const outline = project.outline;
  if (!outline) {
    return { ok: true };
  }

  if (outline.projectId !== project.id) {
    return {
      ok: false,
      statusCode: 400,
      reason: 'Project outline id mismatch',
    };
  }

  const expectedOutlineIds = new Set<string>();
  for (const chapter of outline.chapters) {
    for (const sceneOutline of chapter.sceneOutlines) {
      expectedOutlineIds.add(sceneOutline.id);
    }
  }

  const scenesById = new Map(scenes.map((scene) => [scene.id, scene]));
  const artifactsByOutlineId = new Map(
    project.artifacts.map((artifact) => [artifact.sourceOutlineId, artifact]),
  );

  const readyChapters = outline.chapters.filter((chapter) => chapter.status === 'ready');
  if (readyChapters.length === 0) {
    return {
      ok: false,
      statusCode: 400,
      reason: 'At least one chapter must be ready before publishing',
    };
  }

  for (const chapter of readyChapters) {
    if (chapter.dirty || chapter.locked) {
      return {
        ok: false,
        statusCode: 409,
        reason: `Chapter ${chapter.id} must be unlocked and clean before publishing`,
      };
    }

    if (chapter.sceneOutlines.length === 0) {
      return {
        ok: false,
        statusCode: 400,
        reason: `Chapter ${chapter.id} has no scene outlines to publish`,
      };
    }

    for (const sceneOutline of chapter.sceneOutlines) {
      const artifact = artifactsByOutlineId.get(sceneOutline.id);
      if (
        !artifact ||
        artifact.chapterId !== chapter.id ||
        artifact.outlineRevision !== outline.revision
      ) {
        return {
          ok: false,
          statusCode: 400,
          reason: `Generated artifact is required for outline ${sceneOutline.id}`,
        };
      }

      const scene = scenesById.get(artifact.sceneId);
      if (!scene) {
        return {
          ok: false,
          statusCode: 400,
          reason: `Generated scene is required for outline ${sceneOutline.id}`,
        };
      }

      if (artifact.sceneType !== sceneOutline.type || scene.type !== sceneOutline.type) {
        return {
          ok: false,
          statusCode: 400,
          reason: `Generated scene type mismatch for outline ${sceneOutline.id}`,
        };
      }
    }
  }

  const seenArtifactOutlineIds = new Set<string>();
  for (const artifact of project.artifacts) {
    if (!expectedOutlineIds.has(artifact.sourceOutlineId)) {
      return {
        ok: false,
        statusCode: 400,
        reason: `Generated artifact for outline ${artifact.sourceOutlineId} is not in the current outline`,
      };
    }

    if (artifact.outlineRevision !== outline.revision) {
      return {
        ok: false,
        statusCode: 400,
        reason: `Generated artifact for outline ${artifact.sourceOutlineId} is stale`,
      };
    }

    if (seenArtifactOutlineIds.has(artifact.sourceOutlineId)) {
      return {
        ok: false,
        statusCode: 400,
        reason: `Multiple generated artifacts found for outline ${artifact.sourceOutlineId}`,
      };
    }
    seenArtifactOutlineIds.add(artifact.sourceOutlineId);
  }

  return { ok: true };
}

function validateSceneContents(scenes: Scene[]): PublishValidationResult {
  for (const scene of scenes) {
    const { content } = scene;
    switch (content.type) {
      case 'quiz':
        if (!Array.isArray(content.questions) || content.questions.length === 0) {
          return emptySceneResult(scene, 'quiz questions are required');
        }
        break;
      case 'slide':
        if (
          !content.canvas ||
          !Array.isArray(content.canvas.elements) ||
          content.canvas.elements.length === 0
        ) {
          return emptySceneResult(scene, 'slide canvas elements are required');
        }
        break;
      case 'interactive': {
        const url = typeof content.url === 'string' ? content.url : '';
        const html = typeof content.html === 'string' ? content.html : '';
        if (!url.trim() && !html.trim()) {
          return emptySceneResult(scene, 'interactive url or html is required');
        }
        break;
      }
      case 'pbl':
        if (!content.projectConfig) {
          return emptySceneResult(scene, 'pbl projectConfig is required');
        }
        break;
      default: {
        const exhaustive: never = content;
        return emptySceneResult(
          scene,
          `unsupported scene content ${(exhaustive as { type?: string }).type}`,
        );
      }
    }
  }

  return { ok: true };
}

function emptySceneResult(scene: Scene, reason: string): PublishValidationResult {
  return {
    ok: false,
    statusCode: 400,
    reason: `Scene ${scene.id} ${reason}`,
  };
}

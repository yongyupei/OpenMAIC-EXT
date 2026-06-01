/**
 * @extends-from components/course-editor/slide-template-toolbar-button.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { LayoutTemplate, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

import { SlideTemplatePicker, resolveTemplateName } from '@/components/slide-templates/slide-template-picker';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getBuiltinSlideTemplate } from '@/lib/slide-templates/builtins';
import { BUILTIN_DEFAULT_TEMPLATE_ID } from '@/lib/slide-templates/constants';
import { seedAuthoritativeGenerationSnapshotsFromServer } from '@/lib/generation/slide-generation-snapshot';
import {
  applySlideTemplateThemeToScenes,
  restoreScenesToPipelineDefaultTheme,
} from '@/lib/slide-templates/apply-template-to-scenes';
import type { Scene } from '@/lib/types/stage';
import { fetchSlideTemplates } from '@/lib/slide-templates/client';
import type { SlideTemplateRecord } from '@/lib/slide-templates/types';
import { patchProjectSlideTemplate } from '@/lib/teacher/patch-slide-template';
import type { CourseProject } from '@/lib/teacher/course-types';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useStageStore } from '@/lib/store/stage';
import { cn } from '@/lib/utils';

export interface SlideTemplateToolbarButtonProps {
  readonly projectId: string;
  readonly project: CourseProject;
  /** When set, template is saved on this chapter; otherwise on the project. */
  readonly chapterId?: string;
  readonly courseSlideTemplateId?: string;
  readonly chapterSlideTemplateId?: string;
  /** When set, only these slide scenes receive the new theme; otherwise all slides in the classroom. */
  readonly scopeSceneIds?: ReadonlySet<string> | null;
  readonly onProjectUpdated?: (project: CourseProject) => void;
  readonly onPersistClassroom?: () => Promise<boolean>;
}

async function resolveTemplateRecord(
  templateId: string,
  templates: readonly SlideTemplateRecord[],
): Promise<SlideTemplateRecord | undefined> {
  const fromList = templates.find((template) => template.id === templateId);
  if (fromList) return fromList;
  return getBuiltinSlideTemplate(templateId);
}

async function fetchAuthoritativeScenes(classroomId: string | undefined): Promise<Scene[] | undefined> {
  if (!classroomId) return undefined;

  const response = await fetch(`/api/classroom?id=${encodeURIComponent(classroomId)}`);
  if (!response.ok) return undefined;

  const json = (await response.json()) as {
    success?: boolean;
    classroom?: { scenes?: Scene[] };
  };
  if (!json.success || !json.classroom?.scenes) return undefined;
  return json.classroom.scenes;
}

async function restoreDefaultTemplateScenes(
  scenes: readonly Scene[],
  scopeSceneIds: ReadonlySet<string> | null | undefined,
  classroomId: string | undefined,
): Promise<Scene[]> {
  const authoritativeScenes = await fetchAuthoritativeScenes(classroomId);
  const scenesWithBaseline = authoritativeScenes
    ? seedAuthoritativeGenerationSnapshotsFromServer(scenes, authoritativeScenes)
    : scenes;

  return restoreScenesToPipelineDefaultTheme(
    scenesWithBaseline,
    scopeSceneIds,
    authoritativeScenes,
  );
}

export function SlideTemplateToolbarButton({
  projectId,
  project,
  chapterId,
  courseSlideTemplateId,
  chapterSlideTemplateId,
  scopeSceneIds = null,
  onProjectUpdated,
  onPersistClassroom,
}: SlideTemplateToolbarButtonProps) {
  const { t } = useI18n();
  const scenes = useStageStore.use.scenes();
  const setScenes = useStageStore.use.setScenes();
  const stage = useStageStore.use.stage();

  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<SlideTemplateRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>(
    chapterSlideTemplateId ?? courseSlideTemplateId,
  );
  const [applying, setApplying] = useState(false);

  const effectiveId = chapterSlideTemplateId ?? courseSlideTemplateId;

  useEffect(() => {
    if (!open) return;
    setSelectedId(chapterSlideTemplateId ?? courseSlideTemplateId);
  }, [open, chapterSlideTemplateId, courseSlideTemplateId]);

  useEffect(() => {
    let cancelled = false;
    void fetchSlideTemplates({ includeBuiltin: true, projectId })
      .then((records) => {
        if (!cancelled) setTemplates(records);
      })
      .catch(() => {
        if (!cancelled) setTemplates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const effectiveName = useMemo(
    () => resolveTemplateName(templates, effectiveId),
    [effectiveId, templates],
  );

  const slideCountInScope = useMemo(() => {
    return scenes.filter((scene) => {
      if (scene.type !== 'slide') return false;
      if (!scopeSceneIds) return true;
      return scopeSceneIds.has(scene.id);
    }).length;
  }, [scenes, scopeSceneIds]);

  const handleReset = useCallback(async () => {
    setApplying(true);
    try {
      const nextScenes = await restoreDefaultTemplateScenes(scenes, scopeSceneIds, stage?.id);
      setScenes(nextScenes);

      const updatedProject = await patchProjectSlideTemplate(
        project,
        BUILTIN_DEFAULT_TEMPLATE_ID,
        chapterId,
      );
      onProjectUpdated?.(updatedProject);

      if (onPersistClassroom) {
        const saved = await onPersistClassroom();
        if (!saved) {
          toast.error(t('courseEditor.slideTemplate.saveClassroomFailed'));
          return;
        }
      }

      setSelectedId(BUILTIN_DEFAULT_TEMPLATE_ID);
      toast.success(t('courseEditor.slideTemplate.resetSuccess'));
      setOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('courseEditor.slideTemplate.resetFailed'),
      );
    } finally {
      setApplying(false);
    }
  }, [
    chapterId,
    onPersistClassroom,
    onProjectUpdated,
    project,
    scenes,
    scopeSceneIds,
    setScenes,
    stage?.id,
    t,
  ]);

  const handleApply = useCallback(async () => {
    if (!selectedId || selectedId === effectiveId) {
      setOpen(false);
      return;
    }

    setApplying(true);
    try {
      const record = await resolveTemplateRecord(selectedId, templates);
      if (!record) {
        throw new Error(t('slideTemplates.loadFailed'));
      }

      const nextScenes =
        selectedId === BUILTIN_DEFAULT_TEMPLATE_ID
          ? await restoreDefaultTemplateScenes(scenes, scopeSceneIds, stage?.id)
          : applySlideTemplateThemeToScenes(scenes, record.theme, scopeSceneIds);
      setScenes(nextScenes);

      const updatedProject = await patchProjectSlideTemplate(project, selectedId, chapterId);
      onProjectUpdated?.(updatedProject);

      if (onPersistClassroom) {
        const saved = await onPersistClassroom();
        if (!saved) {
          toast.error(t('courseEditor.slideTemplate.saveClassroomFailed'));
          return;
        }
      }

      toast.success(t('courseEditor.slideTemplate.applySuccess'));
      setOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('courseEditor.slideTemplate.applyFailed'),
      );
    } finally {
      setApplying(false);
    }
  }, [
    chapterId,
    effectiveId,
    onPersistClassroom,
    onProjectUpdated,
    project,
    scenes,
    scopeSceneIds,
    selectedId,
    setScenes,
    stage?.id,
    t,
    templates,
  ]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'p-2 rounded-full text-gray-400 dark:text-gray-500',
            'hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm transition-all',
            open && 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 shadow-sm',
          )}
          title={t('courseEditor.slideTemplate.buttonTitle')}
          aria-label={t('courseEditor.slideTemplate.buttonTitle')}
        >
          <LayoutTemplate className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3 p-4">
        <div>
          <p className="text-sm font-medium">{t('courseEditor.slideTemplate.dialogTitle')}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('courseEditor.slideTemplate.dialogDescription', { count: slideCountInScope })}
          </p>
          {effectiveName ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {t('courseEditor.slideTemplate.current', { name: effectiveName })}
            </p>
          ) : null}
        </div>
        <SlideTemplatePicker
          value={selectedId}
          onChange={setSelectedId}
          projectId={projectId}
          disabled={applying}
        />
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0"
            disabled={applying}
            title={t('courseEditor.slideTemplate.resetTitle')}
            onClick={() => void handleReset()}
          >
            {applying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <RotateCcw className="mr-1.5 h-4 w-4" />
                {t('courseEditor.slideTemplate.reset')}
              </>
            )}
          </Button>
          <Button
            type="button"
            size="sm"
            className="min-w-0 flex-1"
            disabled={applying || !selectedId || selectedId === effectiveId}
            onClick={() => void handleApply()}
          >
            {applying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('courseEditor.slideTemplate.applying')}
              </>
            ) : (
              t('courseEditor.slideTemplate.apply')
            )}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

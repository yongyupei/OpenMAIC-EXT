/**
 * @extends-from components/teacher/chapter-studio-shell.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import '@/components/extends/extends-bootstrap-side-effect';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';
import { ThemeProvider } from '@/lib/hooks/use-theme';
import { MediaStageProvider } from '@/lib/contexts/media-stage-context';
import { CourseEditorShell } from '@/components/course-editor/course-editor-shell';
import { buildChapterGeneratePath, buildTeacherDesignPath } from '@/lib/teacher/routes';
import { useChapterStudioGenerationPoll } from '@/lib/extends/teacher/use-chapter-studio-generation-poll';
import type { CourseChapterClassroomGenerationStep, CourseProject } from '@/lib/teacher/course-types';
import type { SceneOutline } from '@/lib/types/generation';
import { cn } from '@/lib/utils';

interface ChapterStudioShellProps {
  readonly project: CourseProject;
  readonly chapterId: string;
  readonly classroomId: string;
  readonly chapterTitle: string;
  readonly chapterOrder: number;
}

function resolveGenerationStepLabelKey(
  step: CourseChapterClassroomGenerationStep | undefined,
): string {
  switch (step) {
    case 'scene-actions':
      return 'generation.generatingActions';
    case 'media':
      return 'teacher.chapterStudio.generationStep.media';
    case 'tts':
      return 'teacher.chapterStudio.generationStep.tts';
    case 'persist':
      return 'teacher.chapterStudio.generationStep.persist';
    case 'outline':
      return 'generation.generatingOutlines';
    case 'scene-content':
    default:
      return 'generation.generatingSlideContent';
  }
}

export function ChapterStudioShell({
  project,
  chapterId,
  classroomId,
  chapterTitle,
  chapterOrder,
}: ChapterStudioShellProps) {
  const { t } = useI18n();
  const [editorProject, setEditorProject] = useState(project);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [published, setPublished] = useState(
    project.chapterClassrooms?.[chapterId]?.status === 'published',
  );

  const chapter = project.outline?.chapters.find((c) => c.id === chapterId);
  const sceneOutlines = (chapter?.sceneOutlines ?? []) as SceneOutline[];
  const initialClassroom = project.chapterClassrooms?.[chapterId];

  const {
    loading,
    loadFailed,
    generationStep,
    sceneCount,
    totalScenes,
    isGenerating,
    generationFailed,
    failedReason,
    reload,
  } = useChapterStudioGenerationPoll({
    projectId: project.id,
    chapterId,
    classroomId,
    sceneOutlines,
    initialClassroom,
  });

  useEffect(() => {
    setEditorProject(project);
  }, [project]);

  const handlePublishChapter = async () => {
    setPublishing(true);
    setPublishError(null);
    try {
      const response = await fetch(
        `/api/extends/teacher/projects/${encodeURIComponent(project.id)}/chapters/${encodeURIComponent(chapterId)}/publish`,
        { method: 'POST' },
      );
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? `HTTP ${response.status}`);
      }
      setPublished(true);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setPublishing(false);
    }
  };

  const progressPct =
    totalScenes > 0 ? Math.min(100, Math.round((sceneCount / totalScenes) * 100)) : 0;
  const stepLabelKey = resolveGenerationStepLabelKey(generationStep);

  return (
    <ThemeProvider>
      <MediaStageProvider value={classroomId}>
        {loading ? (
          <div className="flex h-screen items-center justify-center bg-background text-muted-foreground">
            {t('common.loading')}
          </div>
        ) : loadFailed ? (
          <div className="flex h-screen items-center justify-center bg-background px-4">
            <div className="max-w-md space-y-4 text-center">
              <p className="text-sm text-destructive">{t('teacher.studio.classroomLoadError')}</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button type="button" onClick={() => void reload()}>
                  {t('courseEditor.retry')}
                </Button>
                <Button type="button" asChild variant="outline">
                  <Link href={buildTeacherDesignPath(project.id)}>
                    {t('teacher.chapterStudio.backToDesign')}
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-screen flex-col overflow-hidden">
            <header className="flex shrink-0 flex-col border-b bg-background">
              <div className="flex items-center justify-between px-4 py-2">
                <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
                  <Link
                    href={buildTeacherDesignPath(project.id)}
                    className="shrink-0 text-sm text-muted-foreground hover:text-foreground"
                  >
                    {t('teacher.chapterStudio.backToDesign')}
                  </Link>
                  <span className="min-w-0 truncate text-sm font-medium">
                    {t('teacher.chapterStudio.chapterLabel', { order: String(chapterOrder) })}
                    {': '}
                    {chapterTitle}
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {publishError && <span className="text-xs text-red-600">{publishError}</span>}
                  {published ? (
                    <span className="text-xs font-medium text-purple-600">
                      {t('teacher.chapterStudio.publishSuccess')}
                    </span>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      disabled={publishing || isGenerating}
                      onClick={() => void handlePublishChapter()}
                    >
                      {publishing
                        ? t('teacher.chapterStudio.publishing')
                        : t('teacher.chapterStudio.publishChapter')}
                    </Button>
                  )}
                </div>
              </div>

              {(isGenerating || generationFailed) && totalScenes > 0 ? (
                <div
                  className={cn(
                    'border-t px-4 py-2.5',
                    generationFailed
                      ? 'border-red-200/70 bg-red-50/60 dark:border-red-900/40 dark:bg-red-950/20'
                      : 'border-purple-200/60 bg-purple-50/50 dark:border-purple-900/40 dark:bg-purple-950/20',
                  )}
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {isGenerating ? (
                      <Loader2 className="size-4 shrink-0 animate-spin text-purple-600 dark:text-purple-300" />
                    ) : null}
                    <p className="text-sm font-medium text-foreground">
                      {generationFailed
                        ? t('generation.generationFailed')
                        : t('teacher.chapterStudio.generatingBanner')}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {t('teacher.preview.sceneProgress', {
                        done: sceneCount,
                        total: totalScenes,
                      })}
                    </span>
                    {isGenerating ? (
                      <span className="text-xs text-muted-foreground">{t(stepLabelKey)}</span>
                    ) : null}
                  </div>
                  {generationFailed && failedReason ? (
                    <p className="mt-1 text-xs text-destructive">{failedReason}</p>
                  ) : null}
                  {generationFailed ? (
                    <div className="mt-2">
                      <Button type="button" size="sm" variant="outline" asChild>
                        <Link href={buildChapterGeneratePath(project.id, chapterId)}>
                          {t('teacher.chapter.retry')}
                        </Link>
                      </Button>
                    </div>
                  ) : null}
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-300',
                        generationFailed ? 'bg-destructive' : 'bg-primary',
                      )}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              ) : null}
            </header>

            <div className="min-h-0 flex-1">
              <CourseEditorShell
                classroomId={classroomId}
                chapterNav={null}
                showWorkflowSettings
                columnLayout="1:3:1"
                sceneListReadOnly={isGenerating}
                slideTemplateEditor={{
                  projectId: editorProject.id,
                  project: editorProject,
                  chapterId,
                  onProjectUpdated: setEditorProject,
                }}
              />
            </div>
          </div>
        )}
      </MediaStageProvider>
    </ThemeProvider>
  );
}

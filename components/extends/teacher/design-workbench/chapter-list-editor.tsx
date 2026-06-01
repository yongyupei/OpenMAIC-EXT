/**
 * @extends-from components/teacher/design-workbench/chapter-list-editor.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { useState } from 'react';
import { Activity, ChevronDown, ChevronRight, Trash2, ArrowDown, ArrowUp, Plus, Settings2 } from 'lucide-react';

import { GenerateLessonsButton } from '@/components/teacher/design-workbench/generate-lessons-button';
import { ChapterReferenceField } from '@/components/teacher/design-workbench/chapter-reference-field';
import { ChapterKnowledgeMountField } from '@/components/teacher/design-workbench/chapter-knowledge-mount-field';
import { ChapterGenerationSettingsDrawer } from './chapter-generation-settings-drawer';
import type { GenerationMode } from '@/lib/slide-templates/types';
import type { GenerationProfile } from '@/lib/teacher/generation-profile';
import { ChapterClassroomStatusBadge } from './chapter-classroom-status-badge';
import { ChapterStudioButton } from '@/components/teacher/design-workbench/chapter-studio-button';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import type { ChapterDraft } from '@/lib/teacher/design-shell-reducer';
import type { ChapterClassroomUiState } from '@/lib/teacher/chapter-classroom-ui';
import type { CourseChapterClassroomStatus } from '@/lib/teacher/course-types';
import { useTraceDetailStore } from '@/lib/extends/observability/trace-detail-store';
import { ProjectTraceDrawer } from '@/components/extends/observability/project-trace-drawer';

/** Studio is available once scenes exist, or while generation is actively in progress. */
function canOpenChapterStudio(
  status: CourseChapterClassroomStatus,
  sceneCount: number,
): boolean {
  if (sceneCount > 0) return true;
  return (
    status === 'generating' ||
    status === 'awaiting-outline-approval' ||
    status === 'ready' ||
    status === 'published'
  );
}

interface ChapterListEditorProps {
  readonly projectId?: string;
  readonly courseSlideTemplateId?: string;
  readonly courseGenerationMode?: GenerationMode;
  readonly courseGenerationProfile?: GenerationProfile;
  readonly chapters: readonly ChapterDraft[];
  readonly expandedChapterIds: ReadonlySet<string>;
  readonly onToggleExpand: (chapterId: string) => void;
  readonly onChapterChange: (
    chapterId: string,
    patch: Partial<
      Pick<
        ChapterDraft,
        | 'title'
        | 'learningObjectives'
        | 'summary'
        | 'deepSearchEnabled'
        | 'slideTemplateId'
        | 'generationMode'
        | 'generationProfileOverride'
        | 'knowledgeNodeIds'
      >
    >,
  ) => void;
  readonly onAddChapter: () => void;
  readonly onRemoveChapter: (chapterId: string) => void;
  readonly onMoveChapter: (chapterId: string, direction: 'up' | 'down') => void;
  readonly onGenerateChapter: (
    chapterId: string,
    options?: { resume?: boolean; regenerate?: boolean },
  ) => void;
  readonly generatingChapterId?: string | null;
  readonly canGenerateChapter?: (chapter: ChapterDraft) => boolean;
  readonly disabled?: boolean;
  readonly highlightedChapterId?: string | null;
  /** Per-chapter classroom statuses from polling (chapterId → status) */
  readonly chapterClassroomStatuses?: Record<string, CourseChapterClassroomStatus>;
  readonly chapterClassroomMeta?: Record<string, ChapterClassroomUiState>;
  /** Opens the chapter-scoped Studio for this chapter. */
  readonly onGoToChapterStudio?: (chapterId: string) => void;
  readonly onShowChapterFailure?: (chapterId: string) => void;
  readonly onUploadChapterReference?: (chapterId: string, file: File) => void | Promise<void>;
  readonly onRemoveChapterReference?: (chapterId: string, fileId: string) => void | Promise<void>;
  readonly referenceUploadChapterId?: string | null;
}

export function ChapterListEditor({
  projectId,
  courseSlideTemplateId,
  courseGenerationMode,
  courseGenerationProfile,
  chapters,
  expandedChapterIds,
  onToggleExpand,
  onChapterChange,
  onAddChapter,
  onRemoveChapter,
  onMoveChapter,
  onGenerateChapter,
  generatingChapterId = null,
  canGenerateChapter,
  disabled,
  highlightedChapterId,
  chapterClassroomStatuses,
  chapterClassroomMeta,
  onGoToChapterStudio,
  onShowChapterFailure,
  onUploadChapterReference,
  onRemoveChapterReference,
  referenceUploadChapterId = null,
}: ChapterListEditorProps) {
  const { t } = useI18n();
  const [traceDrawerOpen, setTraceDrawerOpen] = useState(false);
  const [chapterSettingsDrawerId, setChapterSettingsDrawerId] = useState<string | null>(null);
  const chapterSettingsDrawerChapter = chapters.find(
    (chapter) => chapter.id === chapterSettingsDrawerId,
  );

  return (
    <div className="rounded-xl border border-slate-200/70 bg-white/90 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">
            {t('teacher.create.designWorkbench.chaptersTitle')}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t('teacher.create.designWorkbench.chaptersHint')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {projectId ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              data-testid="teacher-design-ai-trace-menu"
              onClick={() => setTraceDrawerOpen(true)}
            >
              <Activity className="size-3.5" />
              <span className="ml-1">{t('observability.menuLabel')}</span>
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onAddChapter}
            disabled={disabled}
          >
            <Plus className="size-3.5" />
            <span className="ml-1">{t('teacher.create.designWorkbench.addChapter')}</span>
          </Button>
        </div>
      </div>

      <ul className="mt-2 flex flex-col gap-3">
        {chapters.map((chapter, index) => {
          const expanded = expandedChapterIds.has(chapter.id);
          const hot = highlightedChapterId === chapter.id;
          return (
            <li
              key={chapter.id}
              data-testid={`teacher-design-chapter-${chapter.id}`}
              className={cn(
                'rounded-lg border border-slate-200/60 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-950/40',
                hot &&
                  'ring-2 ring-violet-400/70 ring-offset-1 ring-offset-slate-50 dark:ring-offset-slate-950',
              )}
            >
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  className="mt-1 text-muted-foreground hover:text-foreground"
                  aria-expanded={expanded}
                  onClick={() => onToggleExpand(chapter.id)}
                  disabled={disabled}
                >
                  {expanded ? (
                    <ChevronDown className="size-4" />
                  ) : (
                    <ChevronRight className="size-4" />
                  )}
                </button>
                <div className="min-w-0 flex-1 space-y-2">
                  <Input
                    value={chapter.title}
                    onChange={(event) => onChapterChange(chapter.id, { title: event.target.value })}
                    disabled={disabled}
                    className="h-9 font-medium"
                    aria-label={t('teacher.create.designWorkbench.chapterTitleAria', {
                      index: index + 1,
                    })}
                  />
                  {expanded ? (
                    <div className="space-y-3 pl-1">
                      <div>
                        <Label className="text-xs">
                          {t('teacher.create.designWorkbench.objectivesLabel')}
                        </Label>
                        <Textarea
                          value={chapter.learningObjectives.join('\n')}
                          onChange={(event) =>
                            onChapterChange(chapter.id, {
                              learningObjectives: event.target.value
                                .split('\n')
                                .map((line) => line.trimEnd()),
                            })
                          }
                          disabled={disabled}
                          rows={4}
                          className="mt-1 text-sm"
                          placeholder={t('teacher.create.designWorkbench.objectivesPlaceholder')}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">
                          {t('teacher.create.designWorkbench.summaryLabel')}
                        </Label>
                        <Textarea
                          value={chapter.summary}
                          onChange={(event) =>
                            onChapterChange(chapter.id, { summary: event.target.value })
                          }
                          disabled={disabled}
                          rows={4}
                          className="mt-1 min-h-[6.5rem] resize-y text-sm"
                          placeholder={t('teacher.create.designWorkbench.summaryPlaceholder')}
                        />
                      </div>
                      {onUploadChapterReference && onRemoveChapterReference ? (
                        <ChapterReferenceField
                          files={chapter.referenceFiles}
                          disabled={disabled}
                          uploading={referenceUploadChapterId === chapter.id}
                          onUpload={(file) => onUploadChapterReference(chapter.id, file)}
                          onRemove={(fileId) => onRemoveChapterReference(chapter.id, fileId)}
                        />
                      ) : null}
                      {projectId ? (
                        <ChapterKnowledgeMountField
                          selectedNodeIds={chapter.knowledgeNodeIds}
                          onChange={(nodeIds) =>
                            onChapterChange(chapter.id, { knowledgeNodeIds: nodeIds })
                          }
                          disabled={disabled}
                        />
                      ) : null}
                      <div className="flex items-start justify-between gap-3 rounded-md border border-border/50 bg-muted/20 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium">
                            {t('teacher.create.designWorkbench.deepSearchLabel')}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {t('teacher.create.designWorkbench.deepSearchHint')}
                          </p>
                        </div>
                        <Switch
                          checked={chapter.deepSearchEnabled}
                          disabled={disabled}
                          onCheckedChange={(checked) =>
                            onChapterChange(chapter.id, { deepSearchEnabled: checked })
                          }
                          aria-label={t('teacher.create.designWorkbench.deepSearchLabel')}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-end gap-1 border-t border-slate-200/60 pt-3 dark:border-slate-800">
                {(() => {
                  const chapterSettingsButton = projectId ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={disabled}
                      data-testid={`teacher-design-chapter-generation-settings-${chapter.id}`}
                      onClick={() => setChapterSettingsDrawerId(chapter.id)}
                    >
                      <Settings2 className="size-3.5" />
                      <span className="ml-1">{t('teacher.design.generationSettings.title')}</span>
                    </Button>
                  ) : null;
                  const chapterStatus = chapterClassroomStatuses?.[chapter.id];
                  if (!chapterStatus) {
                    return (
                      <div className="flex flex-wrap items-center gap-2">
                        {chapterSettingsButton}
                        <GenerateLessonsButton
                        size="sm"
                        testId={`teacher-design-generate-chapter-${chapter.id}`}
                        disabled={
                          disabled || (canGenerateChapter ? !canGenerateChapter(chapter) : false)
                        }
                        loading={generatingChapterId === chapter.id}
                        onClick={() => onGenerateChapter(chapter.id)}
                      />
                      </div>
                    );
                  }
                  const meta = chapterClassroomMeta?.[chapter.id];
                  const sceneCount = meta?.sceneCount ?? 0;
                  const canOpenStudio = canOpenChapterStudio(chapterStatus, sceneCount);
                  const showRegenerate =
                    chapterStatus === 'failed' ||
                    chapterStatus === 'ready' ||
                    chapterStatus === 'published';
                  return (
                    <div className="flex flex-wrap items-center gap-2">
                      <ChapterClassroomStatusBadge status={chapterStatus} />
                      <span
                        className="text-xs tabular-nums text-muted-foreground"
                        data-testid={`teacher-design-chapter-scene-count-${chapter.id}`}
                      >
                        {t('teacher.chapter.sceneCount', { count: String(sceneCount) })}
                      </span>
                      {chapterStatus === 'failed' ? (
                        <button
                          type="button"
                          className="text-xs text-destructive underline underline-offset-2 hover:text-destructive/80"
                          disabled={disabled}
                          onClick={() => onShowChapterFailure?.(chapter.id)}
                        >
                          {t('teacher.chapter.viewFailureDetails')}
                        </button>
                      ) : null}
                      {chapterStatus === 'failed' && meta?.lastTraceId ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          disabled={disabled}
                          data-testid={`teacher-design-chapter-diagnose-${chapter.id}`}
                          onClick={() =>
                            useTraceDetailStore
                              .getState()
                              .openTrace(meta.lastTraceId!, 'chapter-card')
                          }
                        >
                          {t('observability.diagnoseButton')}
                        </Button>
                      ) : null}
                      {chapterStatus === 'failed' ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-xs"
                          disabled={disabled}
                          onClick={() => onGenerateChapter(chapter.id, { resume: true })}
                        >
                          {t('teacher.chapter.retryContinue')}
                        </Button>
                      ) : null}
                      {showRegenerate ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-xs"
                          disabled={disabled}
                          onClick={() => onGenerateChapter(chapter.id, { regenerate: true })}
                        >
                          {t('teacher.chapter.regenerate')}
                        </Button>
                      ) : null}
                      {chapterSettingsButton}
                      {canOpenStudio ? (
                        <ChapterStudioButton
                          onClick={() => onGoToChapterStudio?.(chapter.id)}
                          disabled={disabled}
                        />
                      ) : null}
                    </div>
                  );
                })()}
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  disabled={disabled || index === 0}
                  onClick={() => onMoveChapter(chapter.id, 'up')}
                  aria-label={t('teacher.create.designWorkbench.moveChapterUp')}
                >
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  disabled={disabled || index >= chapters.length - 1}
                  onClick={() => onMoveChapter(chapter.id, 'down')}
                  aria-label={t('teacher.create.designWorkbench.moveChapterDown')}
                >
                  <ArrowDown className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8 text-destructive hover:text-destructive"
                  disabled={disabled}
                  onClick={() => onRemoveChapter(chapter.id)}
                  aria-label={t('teacher.create.designWorkbench.removeChapter')}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {projectId ? (
        <ProjectTraceDrawer
          projectId={projectId}
          open={traceDrawerOpen}
          onOpenChange={setTraceDrawerOpen}
        />
      ) : null}

      {chapterSettingsDrawerChapter ? (
        <ChapterGenerationSettingsDrawer
          chapterTitle={chapterSettingsDrawerChapter.title}
          projectId={projectId}
          open={chapterSettingsDrawerId !== null}
          onOpenChange={(open) => {
            if (!open) setChapterSettingsDrawerId(null);
          }}
          slideTemplateId={chapterSettingsDrawerChapter.slideTemplateId}
          generationMode={chapterSettingsDrawerChapter.generationMode}
          generationProfileOverride={chapterSettingsDrawerChapter.generationProfileOverride}
          courseSlideTemplateId={courseSlideTemplateId}
          courseGenerationMode={courseGenerationMode}
          courseGenerationProfile={courseGenerationProfile}
          disabled={disabled}
          onSlideTemplateChange={(templateId) =>
            onChapterChange(chapterSettingsDrawerChapter.id, { slideTemplateId: templateId })
          }
          onGenerationModeChange={(mode) =>
            onChapterChange(chapterSettingsDrawerChapter.id, { generationMode: mode })
          }
          onGenerationProfileOverrideChange={(override) =>
            onChapterChange(chapterSettingsDrawerChapter.id, {
              generationProfileOverride: override,
            })
          }
        />
      ) : null}
    </div>
  );
}

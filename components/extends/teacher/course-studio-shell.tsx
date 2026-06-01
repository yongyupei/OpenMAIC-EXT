/**
 * @extends-from components/teacher/course-studio-shell.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import '@/components/extends/extends-bootstrap-side-effect';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { CourseEditorShell } from '@/components/course-editor/course-editor-shell';
import {
  TeacherAssistPanel,
  type TeacherAssistScope,
} from '@/components/teacher/teacher-assist-panel';
import {
  clampRunProgress,
  getTeacherRunStepTranslationKey,
} from '@/components/teacher/teacher-run-status-panel';
import { Button } from '@/components/ui/button';
import { MediaStageProvider } from '@/lib/contexts/media-stage-context';
import { useI18n } from '@/lib/hooks/use-i18n';
import { ThemeProvider } from '@/lib/hooks/use-theme';
import { useStageStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { generateId } from '@/lib/api/stage-api-defaults';
import type { PPTTextElement } from '@/lib/types/slides';
import type { Scene } from '@/lib/types/stage';
import {
  buildCourseEditorChapterNavFromProject,
  getSceneIdsForChapterInOrder,
} from '@/lib/teacher/chapter-scene-order';
import { hydrateClassroomToStageStore } from '@/lib/teacher/hydrate-classroom-to-stage';
import { buildTeacherDesignPath } from '@/lib/teacher/routes';
import type { CourseProject } from '@/lib/teacher/course-types';

interface CourseStudioShellProps {
  readonly project: CourseProject;
  readonly classroomId: string;
  /** When provided, selects the first scene in this chapter after load. */
  readonly initialChapterId?: string | null;
}

export interface TeacherAssistContext {
  readonly projectId: string;
  readonly title: string;
  readonly requirements: CourseProject['requirements'];
  readonly outline: CourseProject['outline'] | null;
  readonly artifactCount: number;
  readonly run: CourseProject['run'] | null;
}

interface AppliedTeacherSuggestion {
  readonly suggestion: string;
  readonly scope: TeacherAssistScope;
  readonly status: TeacherSuggestionApplyStatus;
}

type TeacherSuggestionApplyStatus = 'applied' | 'unsupported';

interface TeacherSuggestionApplication {
  readonly status: TeacherSuggestionApplyStatus;
  readonly scene?: Scene;
}

interface TeacherSuggestionEditorStore {
  readonly getCurrentScene: () => Scene | null;
  readonly updateScene: (sceneId: string, updates: Partial<Scene>) => void;
}

export interface TeacherAssistPanelContract {
  readonly defaultScope: TeacherAssistScope;
  readonly context: TeacherAssistContext;
  readonly onApplySuggestion: (suggestion: string, scope: TeacherAssistScope) => void;
}

export function buildTeacherAssistContext(project: CourseProject): TeacherAssistContext {
  return {
    projectId: project.id,
    title: project.title,
    requirements: project.requirements,
    outline: project.outline ?? null,
    artifactCount: project.artifacts.length,
    run: project.run ?? null,
  };
}

export function getDefaultTeacherAssistScope(_project: CourseProject): TeacherAssistScope {
  return 'outline';
}

export function createTeacherAssistPanelProps(
  project: CourseProject,
  onApplySuggestion: TeacherAssistPanelContract['onApplySuggestion'],
): TeacherAssistPanelContract {
  return {
    defaultScope: getDefaultTeacherAssistScope(project),
    context: buildTeacherAssistContext(project),
    onApplySuggestion,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function appendLine(existing: string | undefined, next: string): string {
  return existing?.trim() ? `${existing.trim()}\n\n${next}` : next;
}

function createTeacherSuggestionTextElement(suggestion: string, index: number): PPTTextElement {
  return {
    id: generateId('teacher-suggestion'),
    type: 'text',
    content: `<p>${escapeHtml(suggestion)}</p>`,
    left: 60,
    top: 120 + index * 36,
    width: 860,
    height: 80,
    rotate: 0,
    defaultFontName: 'Microsoft YaHei',
    defaultColor: '#334155',
    textType: 'notes',
  };
}

export function applyTeacherSuggestionToScene(
  scene: Scene | null,
  suggestion: string,
  scope: TeacherAssistScope,
): TeacherSuggestionApplication {
  const trimmedSuggestion = suggestion.trim();
  if (!scene || !trimmedSuggestion) {
    return { status: 'unsupported' };
  }

  switch (scope) {
    case 'outline':
    case 'chapter':
    case 'slide': {
      if (scene.content.type !== 'slide') {
        return { status: 'unsupported' };
      }

      const elements = scene.content.canvas.elements;
      return {
        status: 'applied',
        scene: {
          ...scene,
          content: {
            ...scene.content,
            canvas: {
              ...scene.content.canvas,
              elements: [
                ...elements,
                createTeacherSuggestionTextElement(trimmedSuggestion, elements.length),
              ],
            },
          },
          updatedAt: Date.now(),
        },
      };
    }
    case 'quiz': {
      if (scene.content.type !== 'quiz') {
        return { status: 'unsupported' };
      }

      const [firstQuestion, ...remainingQuestions] = scene.content.questions;
      const questions = firstQuestion
        ? [
            {
              ...firstQuestion,
              analysis: appendLine(firstQuestion.analysis, trimmedSuggestion),
            },
            ...remainingQuestions,
          ]
        : [
            {
              id: generateId('question'),
              type: 'short_answer' as const,
              question: 'Teacher follow-up',
              commentPrompt: trimmedSuggestion,
              hasAnswer: false,
              points: 1,
            },
          ];

      return {
        status: 'applied',
        scene: {
          ...scene,
          content: {
            ...scene.content,
            questions,
          },
          updatedAt: Date.now(),
        },
      };
    }
    default: {
      const exhaustiveScope: never = scope;
      return exhaustiveScope;
    }
  }
}

export function applyTeacherSuggestionToEditorStore(
  suggestion: string,
  scope: TeacherAssistScope,
  store: TeacherSuggestionEditorStore,
): TeacherSuggestionApplication {
  const result = applyTeacherSuggestionToScene(store.getCurrentScene(), suggestion, scope);
  if (result.status === 'applied' && result.scene) {
    store.updateScene(result.scene.id, {
      title: result.scene.title,
      content: result.scene.content,
      updatedAt: result.scene.updatedAt,
    });
  }
  return result;
}

type ClassroomLoadFlagSetter = (value: boolean) => void;

export function beginClassroomLoad(
  setLoading: ClassroomLoadFlagSetter,
  setLoadFailed: ClassroomLoadFlagSetter,
) {
  setLoading(true);
  setLoadFailed(false);
}

export function CourseStudioUnavailable({ projectId }: { readonly projectId: string }) {
  const { t } = useI18n();

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-purple-50 px-4 py-10 text-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-purple-950 dark:text-slate-50">
      <section className="max-w-lg rounded-2xl border border-slate-200/70 bg-white/85 p-6 text-center shadow-xl shadow-purple-100/40 backdrop-blur dark:border-slate-800 dark:bg-slate-900/85 dark:shadow-purple-950/20">
        <p className="text-sm font-medium text-purple-600 dark:text-purple-300">
          {t('teacher.studio.eyebrow')}
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          {t('teacher.studio.unavailableTitle')}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {t('teacher.studio.unavailableDescription')}
        </p>
        <Button type="button" asChild className="mt-5">
          <Link href={buildTeacherDesignPath(projectId)}>{t('teacher.studio.backToDesign')}</Link>
        </Button>
      </section>
    </main>
  );
}

export function CourseStudioShell({
  project,
  classroomId,
  initialChapterId = null,
}: CourseStudioShellProps) {
  const { t } = useI18n();
  const [assistPanelCollapsed, setAssistPanelCollapsed] = useState(false);
  const { loadFromStorage } = useStageStore();
  const [editorProject, setEditorProject] = useState(project);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [appliedTeacherSuggestion, setAppliedTeacherSuggestion] =
    useState<AppliedTeacherSuggestion | null>(null);

  const applyTeacherSuggestion = useCallback((suggestion: string, scope: TeacherAssistScope) => {
    const result = applyTeacherSuggestionToEditorStore(suggestion, scope, useStageStore.getState());
    setAppliedTeacherSuggestion({ suggestion, scope, status: result.status });
  }, []);
  const assistPanelProps = useMemo(
    () => createTeacherAssistPanelProps(project, applyTeacherSuggestion),
    [project, applyTeacherSuggestion],
  );

  const chapterNav = useMemo(
    () => buildCourseEditorChapterNavFromProject(editorProject),
    [editorProject],
  );

  useEffect(() => {
    setEditorProject(project);
  }, [project]);

  const loadClassroom = useCallback(async () => {
    try {
      beginClassroomLoad(setLoading, setLoadFailed);
      await loadFromStorage(classroomId);

      const store = useStageStore.getState();
      const sceneIdsForChapter = initialChapterId
        ? getSceneIdsForChapterInOrder(project, initialChapterId)
        : [];
      const chapterScenesMissing =
        initialChapterId &&
        sceneIdsForChapter.length > 0 &&
        !sceneIdsForChapter.some((sceneId) =>
          store.scenes.some((scene) => scene.id === sceneId),
        );

      const needsServerHydration =
        store.stage?.id !== classroomId ||
        store.scenes.length === 0 ||
        chapterScenesMissing;

      if (needsServerHydration) {
        const preferredSceneId =
          sceneIdsForChapter.find((sceneId) => store.scenes.some((scene) => scene.id === sceneId)) ??
          sceneIdsForChapter[0] ??
          store.currentSceneId;

        await hydrateClassroomToStageStore(classroomId, {
          clearStoreFirst: store.stage?.id !== classroomId,
          preferredSceneId,
        });
      } else if (initialChapterId) {
        const preferred =
          sceneIdsForChapter.find((sceneId) =>
            store.scenes.some((scene) => scene.id === sceneId),
          ) ?? store.currentSceneId;
        if (preferred) {
          useStageStore.getState().setCurrentSceneId(preferred);
        }
      }
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [classroomId, initialChapterId, loadFromStorage, project]);

  useEffect(() => {
    void loadClassroom();
  }, [loadClassroom]);

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
                <Button type="button" onClick={loadClassroom}>
                  {t('courseEditor.retry')}
                </Button>
                <Button type="button" asChild variant="outline">
                  <Link href={buildTeacherDesignPath(project.id)}>
                    {t('teacher.studio.backToDesign')}
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="relative flex h-screen min-h-0 overflow-hidden">
            <div className="min-w-0 flex-1">
              <CourseEditorShell
                classroomId={classroomId}
                chapterNav={chapterNav}
                showWorkflowSettings={false}
                slideTemplateEditor={{
                  projectId: editorProject.id,
                  project: editorProject,
                  onProjectUpdated: setEditorProject,
                }}
              />
            </div>

            {/* Collapse toggle button - outside aside to avoid overflow-hidden clipping */}
            <button
              type="button"
              onClick={() => setAssistPanelCollapsed(!assistPanelCollapsed)}
              className="absolute top-3 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background shadow-sm transition-[right] duration-200 ease-in-out hover:bg-muted"
              style={{
                right: assistPanelCollapsed ? 'calc(2.5rem - 0.75rem)' : 'calc(24rem - 0.75rem)',
              }}
              aria-label={
                assistPanelCollapsed ? t('teacher.assist.expand') : t('teacher.assist.collapse')
              }
            >
              {assistPanelCollapsed ? (
                <ChevronLeft className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>

            {/* Right panel: collapsible AI assist + run status */}
            <aside
              aria-label={t('teacher.assist.title')}
              className={cn(
                'flex shrink-0 flex-col overflow-hidden border-l bg-background transition-[width] duration-200 ease-in-out',
                assistPanelCollapsed ? 'w-10' : 'w-96',
              )}
            >
              {assistPanelCollapsed ? (
                /* Collapsed state: vertical label */
                <div className="flex h-full flex-col items-center justify-center gap-2 py-4">
                  <span
                    className="text-xs font-medium text-muted-foreground"
                    style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                  >
                    {t('teacher.assist.title')}
                  </span>
                </div>
              ) : (
                /* Expanded state: run status + chat panel */
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
                  {/* Run status (only when run exists) */}
                  {project.run ? (
                    <div className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {t('teacher.studio.runStatusTitle')}
                      </p>
                      <p className="mt-1.5 text-sm font-medium">
                        {t(getTeacherRunStepTranslationKey(project.run.step))}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {project.run.message || t('teacher.studio.runStatusNoMessage')}
                      </p>
                      <div
                        className="mt-2 h-1.5 rounded bg-muted"
                        role="progressbar"
                        aria-label={t('teacher.studio.progressLabel')}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={clampRunProgress(project.run.progress)}
                      >
                        <div
                          className="h-1.5 rounded bg-primary transition-[width] duration-300"
                          style={{ width: `${clampRunProgress(project.run.progress)}%` }}
                        />
                      </div>
                    </div>
                  ) : null}

                  {/* AI Assist chat panel */}
                  <div className="flex h-0 min-h-0 flex-1 flex-col">
                    <TeacherAssistPanel {...assistPanelProps} />
                  </div>

                  {/* Applied suggestion status */}
                  {appliedTeacherSuggestion ? (
                    <p
                      role="status"
                      className={
                        appliedTeacherSuggestion.status === 'applied'
                          ? 'shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200'
                          : 'shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200'
                      }
                    >
                      {appliedTeacherSuggestion.status === 'applied'
                        ? t('teacher.assist.appliedMessage', {
                            scope: t(`teacher.assist.scopes.${appliedTeacherSuggestion.scope}`),
                          })
                        : t('teacher.assist.unsupportedMessage', {
                            scope: t(`teacher.assist.scopes.${appliedTeacherSuggestion.scope}`),
                          })}
                    </p>
                  ) : null}
                </div>
              )}
            </aside>
          </div>
        )}
      </MediaStageProvider>
    </ThemeProvider>
  );
}

/**
 * @extends-from components/course-editor/scene-list-editor.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { useState, useRef, useCallback, useMemo, type CSSProperties } from 'react';
import { Copy, ChevronDown, Loader2, Plus, Trash2, PanelLeftClose, X } from 'lucide-react';
import { SceneRedesignDialog } from '@/components/course-editor/scene-redesign-dialog';
import { SceneRedesignIcon } from './scene-redesign-icon';
import { useSceneRedesign } from '@/lib/hooks/use-scene-redesign';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useStageStore } from '@/lib/store/stage';
import { PENDING_SCENE_ID } from '@/lib/store/stage';
import { useSettingsStore } from '@/lib/store/settings';
import type { Scene, SceneType } from '@/lib/types/stage';
import {
  duplicateScene,
  moveScene,
  normalizeSceneOrder,
} from '@/lib/course-editor/scene-operations';
import { GeneratingSceneListItem } from './generating-scene-list-item';
import type { ResolvedChapterModelContext } from '@/lib/extends/teacher/resolve-chapter-model-config';
import { cn } from '@/lib/utils';
import {
  CourseChapterNavBar,
  type CourseChapterNavChapter,
} from '@/components/course-editor/course-chapter-nav-bar';
import { clonePipelineDefaultSlideTheme } from '@/lib/generation/pipeline-default-slide-theme';
import type { SlideTheme } from '@/lib/types/slides';

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}`;
}

function createQuizScene(stageId: string, order: number, title: string): Scene {
  return {
    id: createId('scene'),
    stageId,
    type: 'quiz',
    title,
    order,
    content: {
      type: 'quiz',
      questions: [
        {
          id: createId('question'),
          type: 'single',
          question: '',
          options: [
            { label: '', value: 'A' },
            { label: '', value: 'B' },
          ],
          answer: [],
          analysis: '',
          hasAnswer: true,
          points: 1,
        },
      ],
    },
    actions: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

const SCENE_TYPE_CONFIG: { type: SceneType; labelKey: string; emoji: string }[] = [
  { type: 'slide', labelKey: 'courseEditor.sceneTypeLabel.slide', emoji: '🖼' },
  { type: 'quiz', labelKey: 'courseEditor.sceneTypeLabel.quiz', emoji: '📊' },
  { type: 'interactive', labelKey: 'courseEditor.sceneTypeLabel.interactive', emoji: '🧪' },
  { type: 'pbl', labelKey: 'courseEditor.sceneTypeLabel.pbl', emoji: '📚' },
];

function SceneTypePicker({
  value,
  onChange,
  disabled,
}: {
  value: SceneType;
  onChange: (type: SceneType) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const current =
    SCENE_TYPE_CONFIG.find((config) => config.type === value) ?? SCENE_TYPE_CONFIG[0]!;

  return (
    <div className="min-w-0 flex-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className="h-8 w-full min-w-0 justify-between gap-1.5 px-2.5 text-xs font-normal shadow-xs"
          >
          <span className="truncate">
            <span className="mr-1">{current.emoji}</span>
            {t(current.labelKey)}
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[var(--radix-popover-trigger-width)] p-1 data-[state=open]:animate-none data-[state=closed]:animate-none"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {SCENE_TYPE_CONFIG.map((config) => (
          <button
            key={config.type}
            type="button"
            className="hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground flex w-full items-center rounded-sm px-2 py-1.5 text-left text-xs outline-none"
            onClick={() => {
              onChange(config.type);
              setOpen(false);
            }}
          >
            <span className="mr-1">{config.emoji}</span>
            {t(config.labelKey)}
          </button>
        ))}
      </PopoverContent>
    </Popover>
    </div>
  );
}

function createSlideScene(
  stageId: string,
  order: number,
  title: string,
  theme?: SlideTheme,
): Scene {
  const defaultTheme = theme ?? clonePipelineDefaultSlideTheme();

  return {
    id: createId('scene'),
    stageId,
    type: 'slide',
    title,
    order,
    content: {
      type: 'slide',
      canvas: {
        id: createId('slide'),
        viewportSize: 1000,
        viewportRatio: 0.5625,
        theme: defaultTheme,
        elements: [],
        background: { type: 'solid', color: defaultTheme.backgroundColor },
      },
    },
    actions: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function createInteractiveScene(stageId: string, order: number, title: string): Scene {
  return {
    id: createId('scene'),
    stageId,
    type: 'interactive',
    title,
    order,
    content: { type: 'interactive', url: '' },
    actions: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function createPblScene(stageId: string, order: number, title: string): Scene {
  return {
    id: createId('scene'),
    stageId,
    type: 'pbl',
    title,
    order,
    content: {
      type: 'pbl',
      projectConfig: {
        projectInfo: { title, description: '' },
        agents: [],
        issueboard: { agent_ids: [], issues: [], current_issue_id: null },
        chat: { messages: [] },
      },
    },
    actions: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function createScene(type: SceneType, stageId: string, order: number, title: string): Scene {
  switch (type) {
    case 'slide':
      return createSlideScene(stageId, order, title);
    case 'quiz':
      return createQuizScene(stageId, order, title);
    case 'interactive':
      return createInteractiveScene(stageId, order, title);
    case 'pbl':
      return createPblScene(stageId, order, title);
  }
}

const LAST_SELECTED_SCENE_TYPE_KEY = 'lastSelectedSceneType';

const DEFAULT_WIDTH = 220;
const MIN_WIDTH = 170;
const MAX_WIDTH = 400;

export interface SceneListEditorChapterNavSlot {
  readonly chapters: readonly CourseChapterNavChapter[];
  readonly activeChapterId: string | null;
  readonly onSelectChapter: (chapterId: string) => void;
}

export function SceneListEditor({
  readOnly = false,
  chapterNav = null,
  proportionalLayout = false,
  generationModelContext = null,
}: {
  readonly readOnly?: boolean;
  /** When set, the sidebar splits 2:3 — chapters on top, course structure below. */
  readonly chapterNav?: SceneListEditorChapterNavSlot | null;
  /** When true, width follows parent flex ratio (e.g. 1:3:1 chapter studio). */
  readonly proportionalLayout?: boolean;
  /** Teacher studio: chapter/course model for scene redesign API calls. */
  readonly generationModelContext?: ResolvedChapterModelContext | null;
}) {
  const { t } = useI18n();
  const stage = useStageStore.use.stage();
  const scenes = useStageStore.use.scenes();
  const outlines = useStageStore.use.outlines();
  const generatingOutlines = useStageStore.use.generatingOutlines();
  const failedOutlines = useStageStore.use.failedOutlines();
  const generationStatus = useStageStore.use.generationStatus();
  const currentSceneId = useStageStore.use.currentSceneId();
  const setScenes = useStageStore.use.setScenes();
  const updateScene = useStageStore.use.updateScene();
  const deleteScene = useStageStore.use.deleteScene();
  const setCurrentSceneId = useStageStore.use.setCurrentSceneId();

  const collapsed = useSettingsStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useSettingsStore((s) => s.setSidebarCollapsed);

  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);

  const {
    redesignTarget,
    setRedesignTarget,
    isRedesigning,
    redesignStep,
    error,
    isSceneRedesigning,
    getSceneRedesignState,
    cancelSceneRedesign,
    clearSceneRedesignError,
    startRedesign,
    cancelRedesign,
  } = useSceneRedesign({ generationModelContext });

  const handleOpenRedesignDialog = useCallback(
    (scene: Scene) => {
      clearSceneRedesignError(scene.id);
      setRedesignTarget(scene);
    },
    [clearSceneRedesignError, setRedesignTarget],
  );

  const redesignSourceOutline = useMemo(() => {
    if (!redesignTarget) return null;
    return outlines.find((o) => o.id === redesignTarget.id) ?? null;
  }, [outlines, redesignTarget]);

  const redesignSpeechTexts = useMemo(() => {
    if (!redesignTarget?.actions) return [] as string[];
    return redesignTarget.actions
      .filter((a) => a.type === 'speech')
      .map((a) => (a.text ?? '').trim())
      .filter((text) => text.length > 0);
  }, [redesignTarget]);

  const [selectedSceneType, setSelectedSceneType] = useState<SceneType>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(LAST_SELECTED_SCENE_TYPE_KEY) as SceneType | null;
      if (saved && SCENE_TYPE_CONFIG.some((c) => c.type === saved)) return saved;
    }
    return 'quiz';
  });

  const handleAddScene = () => {
    if (!stage) return;
    const title = t(`courseEditor.defaultSceneTitle.${selectedSceneType}`, {
      n: scenes.length + 1,
    });
    const newScene = createScene(selectedSceneType, stage.id, scenes.length, title);
    const nextScenes = normalizeSceneOrder([...scenes, newScene]);
    setScenes(nextScenes);
    setCurrentSceneId(nextScenes[nextScenes.length - 1]?.id ?? null);
  };

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      setIsDragging(true);
      const startX = e.clientX;
      const startWidth = sidebarWidth;

      const handleMouseMove = (me: MouseEvent) => {
        const delta = me.clientX - startX;
        const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
        setSidebarWidth(newWidth);
      };

      const handleMouseUp = () => {
        isDraggingRef.current = false;
        setIsDragging(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [sidebarWidth],
  );

  const sortedScenes = [...scenes].sort((a, b) => a.order - b.order);
  const pendingOutline = generatingOutlines[0];
  const pendingFailed =
    pendingOutline != null &&
    (generationStatus === 'error' || failedOutlines.some((outline) => outline.id === pendingOutline.id));

  const renderGeneratingPlaceholder = () => {
    if (!pendingOutline) return null;
    return (
      <GeneratingSceneListItem
        outline={pendingOutline}
        sceneIndex={sortedScenes.length}
        isActive={currentSceneId === PENDING_SCENE_ID}
        isFailed={pendingFailed}
        onSelect={() => setCurrentSceneId(PENDING_SCENE_ID)}
      />
    );
  };

  const renderSceneRedesignStatus = (sceneId: string) => {
    const state = getSceneRedesignState(sceneId);
    if (!state) return null;
    if (state.error) {
      return (
        <div className="mt-2 flex items-start gap-1.5 rounded-md border border-red-200/70 bg-red-50/70 px-1.5 py-1 text-[10px] text-red-700 dark:border-red-800/70 dark:bg-red-900/20 dark:text-red-400">
          <span className="min-w-0 flex-1 truncate" title={state.error}>
            {state.error}
          </span>
          <button
            type="button"
            className="shrink-0 rounded p-0.5 hover:bg-red-100/80 dark:hover:bg-red-900/40"
            onClick={() => clearSceneRedesignError(sceneId)}
            aria-label={t('courseEditor.redesignDismissError')}
            title={t('courseEditor.redesignDismissError')}
          >
            <X className="size-3" />
          </button>
        </div>
      );
    }
    const stepLabel =
      state.step === 'actions'
        ? t('courseEditor.redesignStepActions')
        : t('courseEditor.redesignStepContent');
    return (
      <div className="mt-2 flex items-center gap-1.5 rounded-md border border-purple-200/70 bg-purple-50/70 px-1.5 py-1 text-[10px] text-purple-700 dark:border-purple-800/70 dark:bg-purple-900/20 dark:text-purple-300">
        <Loader2 className="size-3 shrink-0 animate-spin" />
        <span className="min-w-0 flex-1 truncate" title={stepLabel}>
          {stepLabel}
        </span>
        <button
          type="button"
          className="shrink-0 rounded p-0.5 hover:bg-purple-100/80 dark:hover:bg-purple-900/40"
          onClick={() => cancelSceneRedesign(sceneId)}
          aria-label={t('courseEditor.redesignCancelInline')}
          title={t('courseEditor.redesignCancelInline')}
        >
          <X className="size-3" />
        </button>
      </div>
    );
  };

  const renderSceneRedesignButton = (scene: Scene) => {
    const busy = isSceneRedesigning(scene.id);
    return (
      <Button
        size="xs"
        variant="ghost"
        className="text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/20"
        aria-label={t('courseEditor.redesignScene')}
        disabled={busy}
        onClick={() => handleOpenRedesignDialog(scene)}
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <SceneRedesignIcon />
        )}
        {t('courseEditor.redesignScene')}
      </Button>
    );
  };

  const displayWidth = collapsed ? 0 : sidebarWidth;
  const panelStyle: CSSProperties = proportionalLayout
    ? {
        flex: collapsed ? '0 0 0px' : '1 1 0',
        width: collapsed ? 0 : undefined,
        minWidth: 0,
      }
    : {
        width: displayWidth,
        transition: isDragging ? 'none' : 'width 0.3s ease',
      };

  return (
    <div
      style={panelStyle}
      className={cn(
        'relative z-20 flex h-full flex-col overflow-visible border-r border-gray-100 bg-white/80 shadow-[2px_0_24px_rgba(0,0,0,0.02)] backdrop-blur-xl dark:border-gray-800 dark:bg-slate-900/80',
        proportionalLayout ? 'min-w-0' : 'shrink-0',
      )}
    >
      {!collapsed && !proportionalLayout && (
        <div
          onMouseDown={handleDragStart}
          className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize z-50 group hover:bg-purple-400/30 dark:hover:bg-purple-600/30 active:bg-purple-500/40 dark:active:bg-purple-500/40 transition-colors"
        >
          <div className="absolute right-0.5 top-1/2 -translate-y-1/2 w-0.5 h-8 rounded-full bg-gray-300 dark:bg-gray-600 group-hover:bg-purple-400 dark:group-hover:bg-purple-500 transition-colors" />
        </div>
      )}

      <div className={cn('flex h-full w-full flex-col overflow-hidden', collapsed && 'hidden')}>
        {chapterNav && chapterNav.chapters.length > 0 ? (
          <>
            <div className="flex min-h-0 flex-[2] flex-col overflow-hidden">
              <CourseChapterNavBar
                variant="sidebar"
                chapters={chapterNav.chapters}
                activeChapterId={chapterNav.activeChapterId}
                onSelectChapter={chapterNav.onSelectChapter}
              />
            </div>
            <div className="flex min-h-0 flex-[3] flex-col overflow-hidden border-t border-border/50">
              <div className="relative mt-2 mb-1 flex h-10 shrink-0 items-center justify-between gap-2 px-3">
                <div className="min-w-0">
                  <h2 className="truncate text-xs font-bold text-gray-800 dark:text-gray-200">
                    {t('courseEditor.structure')}
                  </h2>
                  <p className="truncate text-[10px] leading-tight text-gray-500 dark:text-gray-400">
                    {t('courseEditor.structureHint')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed(true)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-100/80 text-gray-500 ring-1 ring-black/[0.04] transition-all duration-200 hover:bg-gray-200/90 hover:text-gray-700 active:scale-90 dark:bg-gray-800/80 dark:text-gray-400 dark:ring-white/[0.06] dark:hover:bg-gray-700/90 dark:hover:text-gray-200"
                  title={t('courseEditor.collapseStructurePanel')}
                  aria-label={t('courseEditor.collapseStructurePanel')}
                >
                  <PanelLeftClose className="h-4 w-4" />
                </button>
              </div>

              <div className="shrink-0 px-3 pb-2">
                {!readOnly ? (
                  <div className="flex items-center gap-2">
                    <SceneTypePicker
                      value={selectedSceneType}
                      disabled={!stage}
                      onChange={(value) => {
                        setSelectedSceneType(value);
                        localStorage.setItem(LAST_SELECTED_SCENE_TYPE_KEY, value);
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 px-2"
                      disabled={!stage}
                      onClick={handleAddScene}
                      aria-label={t('courseEditor.addScene')}
                    >
                      <Plus className="size-4" />
                      <span className="sr-only">{t('courseEditor.addScene')}</span>
                    </Button>
                  </div>
                ) : null}
              </div>

              <div className="scrollbar-hide min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden p-2 pt-1">
                {sortedScenes.map((scene, index) => (
                  <div
                    key={scene.id}
                    className={cn(
                      'rounded-lg border p-2',
                      currentSceneId === scene.id
                        ? 'border-purple-200 bg-purple-50/80 dark:border-purple-700 dark:bg-purple-900/20'
                        : 'border-gray-100 bg-card dark:border-gray-800',
                    )}
                  >
                    <button
                      type="button"
                      className="mb-2 w-full text-left text-xs text-muted-foreground"
                      onClick={() => setCurrentSceneId(scene.id)}
                    >
                      {index + 1}. {scene.type}
                    </button>
                    {readOnly ? (
                      <p className="truncate text-xs font-medium text-foreground">{scene.title}</p>
                    ) : (
                      <Input
                        value={scene.title}
                        aria-label={t('courseEditor.sceneTitle')}
                        onFocus={() => setCurrentSceneId(scene.id)}
                        onChange={(event) => updateScene(scene.id, { title: event.target.value })}
                      />
                    )}
                    {!readOnly ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={index === 0}
                          onClick={() => setScenes(moveScene(sortedScenes, scene.id, index - 1))}
                        >
                          {t('courseEditor.moveUp')}
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={index === sortedScenes.length - 1}
                          onClick={() => setScenes(moveScene(sortedScenes, scene.id, index + 1))}
                        >
                          {t('courseEditor.moveDown')}
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label={t('courseEditor.duplicateScene')}
                          onClick={() =>
                            setScenes(
                              duplicateScene(
                                sortedScenes,
                                scene.id,
                                () => createId('scene'),
                                (title) => t('courseEditor.copyTitle', { title }),
                              ),
                            )
                          }
                        >
                          <Copy />
                        </Button>
                        {renderSceneRedesignButton(scene)}
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label={t('courseEditor.deleteScene')}
                          onClick={() => deleteScene(scene.id)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    ) : null}
                    {renderSceneRedesignStatus(scene.id)}
                  </div>
                ))}
                {renderGeneratingPlaceholder()}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="relative mb-1 mt-3 flex h-10 shrink-0 items-center justify-between gap-2 px-3">
              <div className="min-w-0">
                <h2 className="truncate text-xs font-bold text-gray-800 dark:text-gray-200">
                  {t('courseEditor.structure')}
                </h2>
                <p className="truncate text-[10px] leading-tight text-gray-500 dark:text-gray-400">
                  {t('courseEditor.structureHint')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSidebarCollapsed(true)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-100/80 text-gray-500 ring-1 ring-black/[0.04] transition-all duration-200 hover:bg-gray-200/90 hover:text-gray-700 active:scale-90 dark:bg-gray-800/80 dark:text-gray-400 dark:ring-white/[0.06] dark:hover:bg-gray-700/90 dark:hover:text-gray-200"
                title={t('courseEditor.collapseStructurePanel')}
                aria-label={t('courseEditor.collapseStructurePanel')}
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>

            <div className="shrink-0 px-3 pb-2">
              {!readOnly ? (
                <div className="flex items-center gap-2">
                  <SceneTypePicker
                    value={selectedSceneType}
                    disabled={!stage}
                    onChange={(value) => {
                      setSelectedSceneType(value);
                      localStorage.setItem(LAST_SELECTED_SCENE_TYPE_KEY, value);
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 px-2"
                    disabled={!stage}
                    onClick={handleAddScene}
                    aria-label={t('courseEditor.addScene')}
                  >
                    <Plus className="size-4" />
                    <span className="sr-only">{t('courseEditor.addScene')}</span>
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="scrollbar-hide flex-1 space-y-2 overflow-y-auto overflow-x-hidden p-2 pt-1">
              {sortedScenes.map((scene, index) => (
                <div
                  key={scene.id}
                  className={cn(
                    'rounded-lg border p-2',
                    currentSceneId === scene.id
                      ? 'border-purple-200 bg-purple-50/80 dark:border-purple-700 dark:bg-purple-900/20'
                      : 'border-gray-100 bg-card dark:border-gray-800',
                  )}
                >
                  <button
                    type="button"
                    className="mb-2 w-full text-left text-xs text-muted-foreground"
                    onClick={() => setCurrentSceneId(scene.id)}
                  >
                    {index + 1}. {scene.type}
                  </button>
                  {readOnly ? (
                    <p className="truncate text-xs font-medium text-foreground">{scene.title}</p>
                  ) : (
                    <Input
                      value={scene.title}
                      aria-label={t('courseEditor.sceneTitle')}
                      onFocus={() => setCurrentSceneId(scene.id)}
                      onChange={(event) => updateScene(scene.id, { title: event.target.value })}
                    />
                  )}
                  {!readOnly ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Button
                        size="xs"
                        variant="ghost"
                        disabled={index === 0}
                        onClick={() => setScenes(moveScene(sortedScenes, scene.id, index - 1))}
                      >
                        {t('courseEditor.moveUp')}
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        disabled={index === sortedScenes.length - 1}
                        onClick={() => setScenes(moveScene(sortedScenes, scene.id, index + 1))}
                      >
                        {t('courseEditor.moveDown')}
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label={t('courseEditor.duplicateScene')}
                        onClick={() =>
                          setScenes(
                            duplicateScene(
                              sortedScenes,
                              scene.id,
                              () => createId('scene'),
                              (title) => t('courseEditor.copyTitle', { title }),
                            ),
                          )
                        }
                      >
                        <Copy />
                      </Button>
                      {renderSceneRedesignButton(scene)}
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label={t('courseEditor.deleteScene')}
                        onClick={() => deleteScene(scene.id)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ) : null}
                  {renderSceneRedesignStatus(scene.id)}
                </div>
              ))}
              {renderGeneratingPlaceholder()}
            </div>
          </>
        )}
      </div>
      <SceneRedesignDialog
        key={redesignTarget?.id ?? 'closed'}
        scene={redesignTarget}
        sourceOutline={redesignSourceOutline}
        speechTexts={redesignSpeechTexts}
        open={redesignTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isRedesigning) {
            setRedesignTarget(null);
          }
        }}
        isRedesigning={isRedesigning}
        redesignStep={redesignStep}
        error={error}
        onStartRedesign={startRedesign}
        onCancel={cancelRedesign}
      />
    </div>
  );
}

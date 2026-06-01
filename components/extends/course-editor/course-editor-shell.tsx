/**
 * @extends-from components/course-editor/course-editor-shell.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Header } from '@/components/header';
import { CanvasArea } from '@/components/canvas/canvas-area';
import { Roundtable } from '@/components/roundtable';
import { ChatArea, type ChatAreaRef } from '@/components/chat/chat-area';
import { SceneListEditor } from '@/components/course-editor/scene-list-editor';
import { WorkflowConfigPanel } from '@/components/course-editor/workflow-config-panel';
import { defaultWorkflowConfig } from '@/lib/generation/workflow';
import {
  createVideoExportJobRequest,
  uploadVideoExportAssets,
  waitForVideoExportJob,
  type VideoExportJobSnapshot,
} from '@/lib/teacher/video-export-client';
import {
  buildExportAudioZip,
  prepareScenesForVideoExport,
} from '@/lib/teacher/collect-export-audio';
import {
  getExportTtsProviderDisplayName,
  formatVideoExportTtsError,
  isServerExportTtsConfigured,
  resolveExportTtsProviderForVideo,
} from '@/lib/teacher/video-export-tts-config';
import { VideoExportDialog } from '@/components/course-editor/video-export-dialog';
import { SlideTemplateToolbarButton } from '@/components/course-editor/slide-template-toolbar-button';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useStageStore } from '@/lib/store/stage';
import { PENDING_SCENE_ID } from '@/lib/store/stage';
import { useSettingsStore } from '@/lib/store/settings';
import { useCanvasStore } from '@/lib/store/canvas';
import { computePlaybackView } from '@/lib/playback';
import { PlaybackEngine, type EngineMode } from '@/lib/extends/playback';
import { ActionEngine } from '@/lib/action/engine';
import { createAudioPlayer } from '@/lib/utils/audio-player';
import { agentsToParticipants } from '@/lib/orchestration/registry/store';
import type { CourseEditorChapterNavModel } from '@/lib/teacher/chapter-scene-order';
import { patchTeacherProject } from '@/lib/teacher/teacher-projects-client';
import type { CourseProject } from '@/lib/teacher/course-types';
import type { GenerationProfile, GenerationProfileOverride } from '@/lib/teacher/generation-profile';
import type { ResolvedChapterModelContext } from '@/lib/extends/teacher/resolve-chapter-model-config';
import { resolveChapterTargetSceneId } from '@/lib/teacher/chapter-scene-order';
import { cn } from '@/lib/utils';

interface CourseEditorShellProps {
  readonly classroomId: string;
  readonly chapterNav?: CourseEditorChapterNavModel | null;
  readonly editable?: boolean;
  readonly sceneListReadOnly?: boolean;
  /** Prepended before the default save / workflow / preview toolbar actions. */
  readonly toolbarLeadingExtra?: ReactNode;
  /** When false, hides workflow settings (e.g. teacher studio). */
  readonly showWorkflowSettings?: boolean;
  /** Left / center / right width ratio (chapter studio). */
  readonly columnLayout?: 'default' | '1:3:1';
  /** Enables header slide-template picker (teacher studio). */
  readonly slideTemplateEditor?: {
    readonly projectId: string;
    readonly project: CourseProject;
    /** Fixed chapter scope (chapter studio); when omitted, uses the active chapter tab. */
    readonly chapterId?: string;
    readonly onProjectUpdated?: (project: CourseProject) => void;
  };
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function CourseEditorShell({
  classroomId,
  chapterNav = null,
  editable = true,
  sceneListReadOnly = false,
  toolbarLeadingExtra,
  showWorkflowSettings = true,
  columnLayout = 'default',
  slideTemplateEditor,
}: CourseEditorShellProps) {
  const proportionalColumns = columnLayout === '1:3:1';
  const { t } = useI18n();
  const stage = useStageStore.use.stage();
  const scenes = useStageStore.use.scenes();
  const currentSceneId = useStageStore.use.currentSceneId();
  const generatingOutlines = useStageStore.use.generatingOutlines();
  const failedOutlines = useStageStore.use.failedOutlines();
  const generationStatus = useStageStore.use.generationStatus();
  const saveToStorage = useStageStore.use.saveToStorage();
  const setCurrentSceneId = useStageStore.use.setCurrentSceneId();
  const setMode = useStageStore.use.setMode();
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [videoExportJob, setVideoExportJob] = useState<VideoExportJobSnapshot | null>(null);
  const [videoExportBusy, setVideoExportBusy] = useState(false);
  const [videoExportError, setVideoExportError] = useState<string | null>(null);
  const [videoExportDialogOpen, setVideoExportDialogOpen] = useState(false);
  const videoExportAbortRef = useRef<AbortController | null>(null);
  const [workflowId, setWorkflowId] = useState(defaultWorkflowConfig.id);
  const [workflowOpen, setWorkflowOpen] = useState(false);

  // Playback engine state
  const [engineMode, setEngineMode] = useState<EngineMode>('idle');
  const [lectureSpeech, setLectureSpeech] = useState<string | null>(null);
  const engineRef = useRef<PlaybackEngine | null>(null);
  const audioPlayerRef = useRef(createAudioPlayer());
  /** Set before auto-play scene advance; scene effect auto-starts the new engine (mirror stage.tsx). */
  const autoStartRef = useRef(false);

  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useSettingsStore((s) => s.setSidebarCollapsed);
  const chatAreaWidth = useSettingsStore((s) => s.chatAreaWidth);
  const setChatAreaWidth = useSettingsStore((s) => s.setChatAreaWidth);
  const chatAreaCollapsed = useSettingsStore((s) => s.chatAreaCollapsed);
  const setChatAreaCollapsed = useSettingsStore((s) => s.setChatAreaCollapsed);
  const selectedAgentIds = useSettingsStore((s) => s.selectedAgentIds);
  const ttsMuted = useSettingsStore((s) => s.ttsMuted);
  const ttsVolume = useSettingsStore((s) => s.ttsVolume);
  const playbackSpeed = useSettingsStore((s) => s.playbackSpeed);

  // Chapter studio (1:3:1): notes/chat column should be visible; persisted collapse hides it.
  useEffect(() => {
    if (proportionalColumns) {
      setChatAreaCollapsed(false);
    }
  }, [proportionalColumns, setChatAreaCollapsed]);

  const whiteboardOpen = useCanvasStore.use.whiteboardOpen();
  const setWhiteboardOpen = useCanvasStore.use.setWhiteboardOpen();

  const chatAreaRef = useRef<ChatAreaRef>(null);
  const editorRootRef = useRef<HTMLDivElement>(null);

  const currentScene = useMemo(
    () => scenes.find((scene) => scene.id === currentSceneId) ?? scenes[0] ?? null,
    [currentSceneId, scenes],
  );

  const sortedScenes = useMemo(() => [...scenes].sort((a, b) => a.order - b.order), [scenes]);

  const isPendingScene = currentSceneId === PENDING_SCENE_ID;
  const hasNextPending = generatingOutlines.length > 0;
  const canAdvanceToPendingSlot = hasNextPending;
  const isGenerationFailed =
    generationStatus === 'error' &&
    hasNextPending &&
    failedOutlines.some((outline) => outline.id === generatingOutlines[0]?.id);

  const currentSceneIndex = useMemo(() => {
    if (isPendingScene) return sortedScenes.length;
    if (!currentSceneId) return 0;
    const idx = sortedScenes.findIndex((s) => s.id === currentSceneId);
    return idx < 0 ? 0 : idx;
  }, [sortedScenes, currentSceneId, isPendingScene]);

  const activeChapterIdForNav = useMemo(() => {
    if (!chapterNav || !currentSceneId) return chapterNav?.chapters[0]?.id ?? null;
    for (const chapter of chapterNav.chapters) {
      const ids = chapterNav.sceneIdsByChapterId[chapter.id];
      if (ids?.includes(currentSceneId)) return chapter.id;
    }
    return chapterNav.chapters[0]?.id ?? null;
  }, [chapterNav, currentSceneId]);

  const slideTemplateScopeSceneIds = useMemo((): ReadonlySet<string> | null => {
    if (!slideTemplateEditor) return null;
    const targetChapterId = slideTemplateEditor.chapterId ?? activeChapterIdForNav;
    if (!targetChapterId || !chapterNav) return null;
    const mapped = chapterNav.sceneIdsByChapterId[targetChapterId] ?? [];
    const existing = mapped.filter((id) => scenes.some((scene) => scene.id === id));
    return existing.length > 0 ? new Set(existing) : null;
  }, [activeChapterIdForNav, chapterNav, scenes, slideTemplateEditor]);

  const slideTemplateChapter = useMemo(() => {
    if (!slideTemplateEditor) return undefined;
    const chapterId = slideTemplateEditor.chapterId ?? activeChapterIdForNav;
    if (!chapterId) return undefined;
    return slideTemplateEditor.project.outline?.chapters.find(
      (chapter) => chapter.id === chapterId,
    );
  }, [activeChapterIdForNav, slideTemplateEditor]);

  const handleWorkflowGenerationProfileChange = useCallback(
    async (profile: GenerationProfile | undefined) => {
      if (!slideTemplateEditor?.projectId || !profile) return;
      try {
        await patchTeacherProject(slideTemplateEditor.projectId, { generationProfile: profile });
        slideTemplateEditor.onProjectUpdated?.({
          ...slideTemplateEditor.project,
          generationProfile: profile,
        });
      } catch {
        // Best-effort; design workbench has dedicated save toasts.
      }
    },
    [slideTemplateEditor],
  );

  const handleWorkflowChapterProfileOverrideChange = useCallback(
    async (override: GenerationProfileOverride | undefined) => {
      const chapterId = slideTemplateEditor?.chapterId ?? activeChapterIdForNav;
      const project = slideTemplateEditor?.project;
      if (!slideTemplateEditor?.projectId || !chapterId || !project?.outline) return;

      const chapters = project.outline.chapters.map((chapter) =>
        chapter.id === chapterId ? { ...chapter, generationProfileOverride: override } : chapter,
      );
      const nextProject: CourseProject = {
        ...project,
        outline: { ...project.outline, chapters },
      };
      try {
        await patchTeacherProject(slideTemplateEditor.projectId, {
          outline: nextProject.outline,
        });
        slideTemplateEditor.onProjectUpdated?.(nextProject);
      } catch {
        // Best-effort
      }
    },
    [activeChapterIdForNav, slideTemplateEditor],
  );

  const sceneGenerationModelContext = useMemo((): ResolvedChapterModelContext | null => {
    if (!slideTemplateEditor?.project) return null;
    return {
      generationProfile: slideTemplateEditor.project.generationProfile,
      generationProfileOverride: slideTemplateChapter?.generationProfileOverride,
    };
  }, [slideTemplateChapter?.generationProfileOverride, slideTemplateEditor]);

  const handleSelectChapterFromNav = useCallback(
    (chapterId: string) => {
      if (!chapterNav) return;
      const availableIds = new Set(scenes.map((s) => s.id));
      const targetId = resolveChapterTargetSceneId(
        chapterNav,
        chapterId,
        availableIds,
        sortedScenes,
      );
      if (targetId) setCurrentSceneId(targetId);
    },
    [chapterNav, scenes, sortedScenes, setCurrentSceneId],
  );

  const handlePreviousScene = useCallback(() => {
    if (isPendingScene) {
      const lastScene = sortedScenes[sortedScenes.length - 1];
      if (lastScene) setCurrentSceneId(lastScene.id);
      return;
    }
    const idx = sortedScenes.findIndex((s) => s.id === currentSceneId);
    if (idx > 0) setCurrentSceneId(sortedScenes[idx - 1]!.id);
  }, [sortedScenes, currentSceneId, isPendingScene, setCurrentSceneId]);

  const handleNextScene = useCallback(() => {
    if (isPendingScene) return;
    const idx = sortedScenes.findIndex((s) => s.id === currentSceneId);
    if (idx >= 0 && idx < sortedScenes.length - 1) {
      setCurrentSceneId(sortedScenes[idx + 1]!.id);
    } else if (canAdvanceToPendingSlot) {
      setCurrentSceneId(PENDING_SCENE_ID);
    }
  }, [sortedScenes, currentSceneId, canAdvanceToPendingSlot, isPendingScene, setCurrentSceneId]);

  const handleWhiteboardToggle = useCallback(() => {
    setWhiteboardOpen(!whiteboardOpen);
  }, [setWhiteboardOpen, whiteboardOpen]);

  const participants = useMemo(
    () => agentsToParticipants(selectedAgentIds, t),
    [selectedAgentIds, t],
  );

  // Initialize playback engine when current scene changes
  useEffect(() => {
    // Stop previous engine
    if (engineRef.current) {
      engineRef.current.stop();
      engineRef.current = null;
    }
    setEngineMode('idle');
    setLectureSpeech(null);

    if (!currentScene?.actions?.length) return;

    const actionEngine = new ActionEngine(useStageStore, audioPlayerRef.current, undefined);
    const engine = new PlaybackEngine([currentScene], actionEngine, audioPlayerRef.current, {
      onModeChange: (mode) => setEngineMode(mode),
      onSpeechStart: (text) => setLectureSpeech(text),
      onSpeechEnd: () => {
        // Keep last speech text visible until next speech starts
      },
      getPlaybackSpeed: () => useSettingsStore.getState().playbackSpeed || 1,
      onComplete: () => {
        // Auto-play: advance to next scene after a short pause (mirror components/stage.tsx).
        const { autoPlayLecture } = useSettingsStore.getState();
        if (!autoPlayLecture) return;
        setTimeout(() => {
          if (!useSettingsStore.getState().autoPlayLecture) return;
          const stageState = useStageStore.getState();
          const allScenes = [...stageState.scenes].sort((a, b) => a.order - b.order);
          const curId = stageState.currentSceneId;
          const idx = allScenes.findIndex((s) => s.id === curId);
          if (idx >= 0 && idx < allScenes.length - 1) {
            const scene = allScenes[idx]!;
            if (
              scene.type === 'quiz' ||
              scene.type === 'interactive' ||
              scene.type === 'pbl'
            ) {
              return;
            }
            autoStartRef.current = true;
            stageState.setCurrentSceneId(allScenes[idx + 1]!.id);
          } else if (
            idx === allScenes.length - 1 &&
            stageState.generatingOutlines.length > 0
          ) {
            const scene = allScenes[idx]!;
            if (
              scene.type === 'quiz' ||
              scene.type === 'interactive' ||
              scene.type === 'pbl'
            ) {
              return;
            }
            autoStartRef.current = true;
            stageState.setCurrentSceneId(PENDING_SCENE_ID);
          }
        }, 1500);
      },
    });
    engineRef.current = engine;

    // Auto-start if triggered by auto-play scene advance (mirror components/stage.tsx).
    if (autoStartRef.current) {
      autoStartRef.current = false;
      void engine.start();
    }

    return () => {
      engine.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSceneId, currentScene?.actions?.length]);

  // Cleanup on unmount (mirror components/stage.tsx)
  useEffect(() => {
    const audioPlayer = audioPlayerRef.current;
    return () => {
      if (engineRef.current) {
        engineRef.current.stop();
      }
      audioPlayer.destroy();
    };
  }, []);

  // Sync mute / volume / playback speed from settings → audioPlayer (mirror stage.tsx)
  useEffect(() => {
    audioPlayerRef.current.setMuted(ttsMuted);
  }, [ttsMuted]);

  useEffect(() => {
    if (!ttsMuted) {
      audioPlayerRef.current.setVolume(ttsVolume);
    }
  }, [ttsVolume, ttsMuted]);

  useEffect(() => {
    audioPlayerRef.current.setPlaybackRate(playbackSpeed);
  }, [playbackSpeed]);

  const handlePlayPause = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;

    const mode = engine.getMode();
    if (mode === 'playing' || mode === 'live') {
      engine.pause();
    } else if (mode === 'paused') {
      engine.resume();
    } else {
      engine.start();
    }
  }, []);

  useEffect(() => {
    setMode('autonomous');
    return () => setMode('playback');
  }, [setMode]);

  useEffect(() => {
    if (!currentSceneId && scenes[0]) {
      setCurrentSceneId(scenes[0].id);
    }
  }, [currentSceneId, scenes, setCurrentSceneId]);

  const persistCourseToServer = useCallback(async (): Promise<boolean> => {
    const { stage: currentStage, scenes: currentScenes } = useStageStore.getState();
    if (!currentStage) return false;
    if (
      currentStage.id !== classroomId ||
      currentScenes.some((scene) => scene.stageId !== classroomId)
    ) {
      return false;
    }
    await saveToStorage();
    const response = await fetch('/api/extends/classroom', { method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: classroomId,
        stage: currentStage,
        scenes: currentScenes,
        sourceWorkflowId: workflowId,
      }),
    });
    return response.ok;
  }, [classroomId, saveToStorage, workflowId]);

  const headerToolbarPillExtra = useMemo(() => {
    if (!slideTemplateEditor) return null;
    return (
      <SlideTemplateToolbarButton
        projectId={slideTemplateEditor.projectId}
        project={slideTemplateEditor.project}
        chapterId={slideTemplateEditor.chapterId ?? activeChapterIdForNav ?? undefined}
        courseSlideTemplateId={slideTemplateEditor.project.slideTemplateId}
        chapterSlideTemplateId={slideTemplateChapter?.slideTemplateId}
        scopeSceneIds={slideTemplateScopeSceneIds}
        onProjectUpdated={slideTemplateEditor.onProjectUpdated}
        onPersistClassroom={persistCourseToServer}
      />
    );
  }, [
    activeChapterIdForNav,
    persistCourseToServer,
    slideTemplateChapter?.slideTemplateId,
    slideTemplateEditor,
    slideTemplateScopeSceneIds,
  ]);

  const saveCourse = async () => {
    setSaveState('saving');
    try {
      const ok = await persistCourseToServer();
      setSaveState(ok ? 'saved' : 'error');
    } catch {
      setSaveState('error');
    }
  };

  useEffect(() => {
    return () => {
      videoExportAbortRef.current?.abort();
    };
  }, []);

  const startVideoExport = async () => {
    if (videoExportBusy || scenes.length === 0) return;

    videoExportAbortRef.current?.abort();
    const controller = new AbortController();
    videoExportAbortRef.current = controller;

    setVideoExportBusy(true);
    setVideoExportError(null);
    setVideoExportJob(null);
    setVideoExportDialogOpen(true);

    try {
      await useSettingsStore.getState().fetchServerProviders();
      let exportProviderId: string;
      try {
        exportProviderId = await resolveExportTtsProviderForVideo();
      } catch {
        setVideoExportError(t('courseEditor.videoExportNoTtsProvider'));
        return;
      }
      const exportProviderName = getExportTtsProviderDisplayName(exportProviderId);
      const useServerNarration = isServerExportTtsConfigured();

      setSaveState('saving');
      const saved = await persistCourseToServer();
      setSaveState(saved ? 'saved' : 'error');
      if (!saved) {
        setVideoExportError(t('courseEditor.saveError'));
        return;
      }

      let preparedScenes = scenes;
      let missingSceneIds: string[] = [];
      let speechCueCount = 0;
      let lastTtsError: string | undefined;

      setVideoExportJob({
        id: 'preparing',
        status: 'running',
        step: 'collecting-assets',
        progress: 5,
        message: t('courseEditor.videoExportPreparingAudioProvider', {
          provider: exportProviderName,
        }),
      });

      const prepared = await prepareScenesForVideoExport(scenes, {
        signal: controller.signal,
        onProgress: (completed, total) => {
          if (controller.signal.aborted) return;
          setVideoExportJob({
            id: 'preparing',
            status: 'running',
            step: 'collecting-assets',
            progress: total > 0 ? 5 + Math.round((completed / total) * 20) : 10,
            message:
              total > 0
                ? t('courseEditor.videoExportGeneratingAudio', {
                    done: completed,
                    total,
                    provider: exportProviderName,
                  })
                : t('courseEditor.videoExportPreparingAudioProvider', {
                    provider: exportProviderName,
                  }),
          });
        },
      });
      preparedScenes = prepared.scenes;
      missingSceneIds = prepared.missingSceneIds;
      speechCueCount = prepared.speechCueCount;
      lastTtsError = prepared.lastTtsError;

      setVideoExportJob({
        id: 'preparing',
        status: 'running',
        step: 'collecting-assets',
        progress: 25,
        message:
          speechCueCount > 0
            ? t('courseEditor.videoExportPreparingAudioCount', { count: speechCueCount })
            : t('courseEditor.videoExportPreparingAudio'),
      });

      if (missingSceneIds.length > 0 && !useServerNarration) {
        const ttsDetail = formatVideoExportTtsError(lastTtsError);
        setVideoExportError(
          ttsDetail ??
            t('courseEditor.videoExportMissingAudio', {
              scenes: missingSceneIds.join(', '),
            }),
        );
        return;
      }

      if (missingSceneIds.length > 0 && useServerNarration && lastTtsError) {
        const ttsDetail = formatVideoExportTtsError(lastTtsError);
        if (ttsDetail && /额度已用尽|API Key 无效/i.test(ttsDetail)) {
          setVideoExportError(ttsDetail);
          return;
        }
      }

      useStageStore.setState({ scenes: preparedScenes });
      const savedWithAudio = await persistCourseToServer();
      if (!savedWithAudio) {
        setVideoExportError(t('courseEditor.saveError'));
        return;
      }

      const audioZip = await buildExportAudioZip(preparedScenes);
      const hasSpeech = speechCueCount > 0;

      if (!audioZip && hasSpeech && missingSceneIds.length > 0 && !useServerNarration) {
        setVideoExportError(t('courseEditor.videoExportMissingAudioFiles'));
        return;
      }

      const created = await createVideoExportJobRequest(classroomId, {
        clientWillUploadAssets: Boolean(audioZip),
        serverNarrationFallback:
          useServerNarration && missingSceneIds.length > 0 && !audioZip,
      });
      if (!created.ok) {
        setVideoExportError(created.error);
        return;
      }

      if (audioZip) {
        setVideoExportJob({
          id: created.jobId,
          status: 'running',
          step: 'collecting-assets',
          progress: 28,
          message: t('courseEditor.videoExportUploading'),
        });
        await uploadVideoExportAssets(created.jobId, audioZip);
      }

      setVideoExportJob({
        id: created.jobId,
        status: 'queued',
        step: 'queued',
        progress: audioZip ? 0 : 12,
        message:
          !audioZip && useServerNarration && missingSceneIds.length > 0
            ? t('courseEditor.videoExportServerNarration', { provider: exportProviderName })
            : t('courseEditor.videoExportCreating'),
      });

      const finalJob = await waitForVideoExportJob(created.jobId, {
        signal: controller.signal,
        onUpdate: (job) => {
          if (!controller.signal.aborted) {
            setVideoExportJob(job);
          }
        },
      });

      if (controller.signal.aborted) return;

      setVideoExportJob(finalJob);
      if (finalJob.status === 'failed') {
        setVideoExportError(finalJob.error ?? t('courseEditor.videoExportFailedGeneric'));
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (error instanceof Error && error.message === 'NO_EXPORT_TTS_PROVIDER') {
        setVideoExportError(t('courseEditor.videoExportNoTtsProvider'));
        return;
      }
      if (
        error instanceof Error &&
        error.message === 'BROWSER_NATIVE_TTS_NOT_SUPPORTED_FOR_EXPORT'
      ) {
        setVideoExportError(t('courseEditor.videoExportBrowserTtsUnsupported'));
        return;
      }
      setVideoExportError(
        error instanceof Error ? error.message : t('courseEditor.videoExportFailedGeneric'),
      );
    } finally {
      if (videoExportAbortRef.current === controller) {
        videoExportAbortRef.current = null;
      }
      setVideoExportBusy(false);
    }
  };

  const sceneListChapterNav =
    chapterNav && chapterNav.chapters.length > 0
      ? {
          chapters: chapterNav.chapters,
          activeChapterId: activeChapterIdForNav,
          onSelectChapter: handleSelectChapterFromNav,
        }
      : null;

  const firstSpeechText = useMemo(
    () =>
      currentScene?.actions?.find((a) => a.type === 'speech')
        ? ((currentScene.actions.find((a) => a.type === 'speech') as { text?: string }).text ??
          null)
        : null,
    [currentScene],
  );

  const playbackView = useMemo(
    () =>
      computePlaybackView({
        engineMode,
        lectureSpeech,
        liveSpeech: null,
        speakingAgentId: null,
        thinkingState: null,
        isCueUser: false,
        isTopicPending: false,
        chatIsStreaming: false,
        discussionTrigger: null,
        playbackCompleted: false,
        idleText: firstSpeechText,
        speakingStudent: false,
        sessionType: null,
      }),
    [engineMode, lectureSpeech, firstSpeechText],
  );

  // Toolbar buttons rendered in the Roundtable's right section
  const toolbarTrailingExtra = (
    <div className="flex items-center gap-1.5 pl-1.5 border-l border-gray-200/60 dark:border-gray-700/40 ml-0.5">
      {toolbarLeadingExtra}
      {saveState === 'saved' && (
        <span className="text-xs text-green-600 dark:text-green-500">
          {t('courseEditor.saved')}
        </span>
      )}
      {saveState === 'error' && (
        <span className="text-xs text-destructive">{t('courseEditor.saveError')}</span>
      )}
      {videoExportBusy ? (
        <span className="hidden max-w-[14rem] truncate text-xs text-muted-foreground sm:inline">
          {t('courseEditor.videoExportCreating')}
        </span>
      ) : null}
      {showWorkflowSettings ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => setWorkflowOpen(true)}
        >
          {t('courseEditor.configureWorkflow')}
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs"
        onClick={() => void startVideoExport()}
        disabled={videoExportBusy || scenes.length === 0 || !stage}
        title={scenes.length === 0 ? t('courseEditor.videoExportNoScenes') : undefined}
      >
        {videoExportBusy ? t('courseEditor.videoExportCreating') : t('courseEditor.publishVideo')}
      </Button>
      <Button
        type="button"
        size="sm"
        className="h-6 px-2 text-xs"
        onClick={saveCourse}
        disabled={!stage || saveState === 'saving'}
      >
        {saveState === 'saving' ? t('courseEditor.saving') : t('courseEditor.save')}
      </Button>
      <Button type="button" asChild variant="outline" size="sm" className="h-6 px-2 text-xs">
        <Link href={`/classroom/${classroomId}`}>{t('courseEditor.preview')}</Link>
      </Button>
    </div>
  );

  return (
    <div
      ref={editorRootRef}
      className={cn(
        'flex h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden bg-gray-50 dark:bg-gray-900',
      )}
    >
      <SceneListEditor
        readOnly={sceneListReadOnly}
        chapterNav={sceneListChapterNav}
        proportionalLayout={proportionalColumns}
        generationModelContext={sceneGenerationModelContext}
      />

      <div
        className={cn(
          'relative flex min-w-0 flex-col overflow-hidden',
          proportionalColumns ? 'flex-[3]' : 'flex-1',
        )}
      >
        <Header
          currentSceneTitle={currentScene?.title || stage?.name || t('courseEditor.title')}
          showBack={false}
          showThemeToggle={false}
          toolbarPillExtra={headerToolbarPillExtra}
        />

        <div className="relative isolate min-h-0 flex-1 overflow-hidden" suppressHydrationWarning>
          {currentScene || isPendingScene ? (
            <CanvasArea
              currentScene={currentScene}
              currentSceneIndex={currentSceneIndex}
              scenesCount={sortedScenes.length + (canAdvanceToPendingSlot ? 1 : 0)}
              mode="playback"
              engineState={
                engineMode === 'playing' ? 'playing' : engineMode === 'paused' ? 'paused' : 'idle'
              }
              isLiveSession={false}
              whiteboardOpen={whiteboardOpen}
              sidebarCollapsed={sidebarCollapsed}
              chatCollapsed={chatAreaCollapsed}
              onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
              onToggleChat={() => setChatAreaCollapsed(!chatAreaCollapsed)}
              onPrevSlide={handlePreviousScene}
              onNextSlide={handleNextScene}
              onPlayPause={handlePlayPause}
              onWhiteboardClose={handleWhiteboardToggle}
              isPresenting={false}
              onTogglePresentation={() => {}}
              showStopDiscussion={false}
              onStopDiscussion={() => {}}
              hideToolbar
              isPendingScene={isPendingScene}
              isCourseComplete={false}
              isGenerationFailed={isGenerationFailed}
              editable={editable}
              htmlSlidePreview={Boolean(slideTemplateEditor)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gray-50 dark:bg-gray-900 text-sm text-muted-foreground">
              {t('courseEditor.noScene')}
            </div>
          )}
        </div>

        <div className="shrink-0">
          <div className="flex h-8 items-center justify-end border-b border-gray-100/40 bg-white/80 px-3 dark:border-gray-700/30 dark:bg-gray-900/80">
            {toolbarTrailingExtra}
          </div>
          <Roundtable
            mode="playback"
            initialParticipants={participants}
            playbackView={playbackView}
            engineMode={engineMode}
            currentSpeech={null}
            lectureSpeech={lectureSpeech}
            idleText={firstSpeechText}
            playbackCompleted={false}
            discussionRequest={null}
            isStreaming={false}
            audioIndicatorState="idle"
            audioAgentId={null}
            speechProgress={null}
            showEndFlash={false}
            thinkingState={null}
            isCueUser={false}
            isTopicPending={false}
            onMessageSend={async () => {}}
            onDiscussionStart={() => {}}
            onDiscussionSkip={() => {}}
            onStopDiscussion={() => {}}
            onInputActivate={() => {}}
            onResumeTopic={() => {}}
            onPlayPause={handlePlayPause}
            isDiscussionPaused={false}
            onDiscussionPause={() => {}}
            onDiscussionResume={() => {}}
            totalActions={currentScene?.actions?.length ?? 0}
            currentActionIndex={0}
            currentSceneIndex={currentSceneIndex}
            scenesCount={scenes.length}
            whiteboardOpen={whiteboardOpen}
            sidebarCollapsed={sidebarCollapsed}
            chatCollapsed={chatAreaCollapsed}
            onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
            onToggleChat={() => setChatAreaCollapsed(!chatAreaCollapsed)}
            onPrevSlide={handlePreviousScene}
            onNextSlide={handleNextScene}
            onWhiteboardClose={handleWhiteboardToggle}
            isPresenting={false}
            controlsVisible
            onTogglePresentation={() => {}}
            fullscreenContainerRef={editorRootRef}
          />
        </div>
      </div>

      <ChatArea
        ref={chatAreaRef}
        width={chatAreaWidth}
        onWidthChange={setChatAreaWidth}
        collapsed={chatAreaCollapsed}
        onCollapseChange={setChatAreaCollapsed}
        currentSceneId={currentSceneId}
        lectureNotesEditable
        proportionalLayout={proportionalColumns}
      />

      <VideoExportDialog
        open={videoExportDialogOpen}
        onOpenChange={setVideoExportDialogOpen}
        busy={videoExportBusy}
        error={videoExportError}
        job={videoExportJob}
        onCancel={() => videoExportAbortRef.current?.abort()}
      />

      {showWorkflowSettings ? (
        <Dialog open={workflowOpen} onOpenChange={setWorkflowOpen}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t('courseEditor.workflow')}</DialogTitle>
              <DialogDescription>{t('courseEditor.workflowHint')}</DialogDescription>
            </DialogHeader>
            <WorkflowConfigPanel
              selectedWorkflowId={workflowId}
              onSelectWorkflow={setWorkflowId}
              hideTitle
              className="h-auto max-h-none w-full max-w-full shrink-0 border-0 p-0"
              projectSlideTemplateId={
                slideTemplateEditor?.project.slideTemplateId ??
                slideTemplateEditor?.project.generationProfile?.slideTemplateId
              }
              projectGenerationMode={
                slideTemplateEditor?.project.generationMode ??
                slideTemplateEditor?.project.generationProfile?.generationMode
              }
              generationProfile={slideTemplateEditor?.project.generationProfile}
              onGenerationProfileChange={
                slideTemplateEditor?.chapterId
                  ? undefined
                  : handleWorkflowGenerationProfileChange
              }
              chapterId={slideTemplateEditor?.chapterId ?? activeChapterIdForNav ?? undefined}
              generationProfileOverride={slideTemplateChapter?.generationProfileOverride}
              onGenerationProfileOverrideChange={
                slideTemplateEditor?.chapterId || activeChapterIdForNav
                  ? handleWorkflowChapterProfileOverrideChange
                  : undefined
              }
            />
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

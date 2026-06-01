/**
 * @extends-from components/course-editor/course-editor/course-editor-shell.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useI18n } from '@/lib/hooks/use-i18n';
import { useStageStore } from '@/lib/store/stage';
import { useSettingsStore } from '@/lib/store/settings';
import { useCanvasStore } from '@/lib/store/canvas';
import { computePlaybackView } from '@/lib/playback';
import { agentsToParticipants } from '@/lib/orchestration/registry/store';
import type { SpeechAction } from '@/lib/types/action';
import { cn } from '@/lib/utils';

interface CourseEditorShellProps {
  readonly classroomId: string;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function CourseEditorShell({ classroomId }: CourseEditorShellProps) {
  const { t } = useI18n();
  const stage = useStageStore.use.stage();
  const scenes = useStageStore.use.scenes();
  const currentSceneId = useStageStore.use.currentSceneId();
  const saveToStorage = useStageStore.use.saveToStorage();
  const setCurrentSceneId = useStageStore.use.setCurrentSceneId();
  const setMode = useStageStore.use.setMode();
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [videoJobId, setVideoJobId] = useState<string | null>(null);
  const [workflowId, setWorkflowId] = useState(defaultWorkflowConfig.id);
  const [workflowOpen, setWorkflowOpen] = useState(false);

  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useSettingsStore((s) => s.setSidebarCollapsed);
  const chatAreaWidth = useSettingsStore((s) => s.chatAreaWidth);
  const setChatAreaWidth = useSettingsStore((s) => s.setChatAreaWidth);
  const chatAreaCollapsed = useSettingsStore((s) => s.chatAreaCollapsed);
  const setChatAreaCollapsed = useSettingsStore((s) => s.setChatAreaCollapsed);
  const selectedAgentIds = useSettingsStore((s) => s.selectedAgentIds);

  const whiteboardOpen = useCanvasStore.use.whiteboardOpen();
  const setWhiteboardOpen = useCanvasStore.use.setWhiteboardOpen();

  const chatAreaRef = useRef<ChatAreaRef>(null);
  const editorRootRef = useRef<HTMLDivElement>(null);

  const currentScene = useMemo(
    () => scenes.find((scene) => scene.id === currentSceneId) ?? scenes[0] ?? null,
    [currentSceneId, scenes],
  );

  const sortedScenes = useMemo(() => [...scenes].sort((a, b) => a.order - b.order), [scenes]);

  const currentSceneIndex = useMemo(() => {
    if (!currentSceneId) return 0;
    const idx = sortedScenes.findIndex((s) => s.id === currentSceneId);
    return idx < 0 ? 0 : idx;
  }, [sortedScenes, currentSceneId]);

  const handlePreviousScene = useCallback(() => {
    const idx = sortedScenes.findIndex((s) => s.id === currentSceneId);
    if (idx > 0) setCurrentSceneId(sortedScenes[idx - 1]!.id);
  }, [sortedScenes, currentSceneId, setCurrentSceneId]);

  const handleNextScene = useCallback(() => {
    const idx = sortedScenes.findIndex((s) => s.id === currentSceneId);
    if (idx >= 0 && idx < sortedScenes.length - 1) setCurrentSceneId(sortedScenes[idx + 1]!.id);
  }, [sortedScenes, currentSceneId, setCurrentSceneId]);

  const handleWhiteboardToggle = useCallback(() => {
    setWhiteboardOpen(!whiteboardOpen);
  }, [setWhiteboardOpen, whiteboardOpen]);

  const noop = useCallback(() => {}, []);

  const participants = useMemo(
    () => agentsToParticipants(selectedAgentIds, t),
    [selectedAgentIds, t],
  );

  const firstSpeechText = useMemo(
    () => currentScene?.actions?.find((a): a is SpeechAction => a.type === 'speech')?.text ?? null,
    [currentScene],
  );

  const playbackView = useMemo(
    () =>
      computePlaybackView({
        engineMode: 'idle',
        lectureSpeech: null,
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
    [firstSpeechText],
  );

  useEffect(() => {
    setMode('autonomous');
    return () => setMode('playback');
  }, [setMode]);

  useEffect(() => {
    if (!currentSceneId && scenes[0]) {
      setCurrentSceneId(scenes[0].id);
    }
  }, [currentSceneId, scenes, setCurrentSceneId]);

  const saveCourse = async () => {
    if (!stage) return;
    if (stage.id !== classroomId || scenes.some((scene) => scene.stageId !== classroomId)) {
      setSaveState('error');
      return;
    }
    setSaveState('saving');
    try {
      await saveToStorage();
      const response = await fetch('/api/extends/classroom', { method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: classroomId, stage, scenes, sourceWorkflowId: workflowId }),
      });
      if (!response.ok) {
        throw new Error(`Save failed: ${response.status}`);
      }
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  };

  const startVideoExport = async () => {
    const response = await fetch('/api/extends/export-video', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ classroomId, strategy: 'static' }),
    });
    if (!response.ok) return;
    const json = await response.json();
    if (json.success) {
      setVideoJobId(json.jobId);
    }
  };

  const headerHeight = 80;
  const roundtableHeight = 192;
  const sceneViewerHeight = `calc(100% - ${headerHeight + roundtableHeight}px)`;

  const toolbarExtra = (
    <>
      {saveState === 'saved' && (
        <span className="text-xs text-green-600 dark:text-green-500">
          {t('courseEditor.saved')}
        </span>
      )}
      {saveState === 'error' && (
        <span className="text-xs text-destructive">{t('courseEditor.saveError')}</span>
      )}
      {videoJobId && (
        <span className="hidden sm:inline text-xs text-muted-foreground max-w-[10rem] truncate">
          {t('courseEditor.videoJobCreated', { jobId: videoJobId })}
        </span>
      )}
      <Button type="button" variant="outline" size="sm" onClick={() => setWorkflowOpen(true)}>
        {t('courseEditor.configureWorkflow')}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={startVideoExport}>
        {t('courseEditor.publishVideoDraft')}
      </Button>
      <Button
        type="button"
        size="sm"
        onClick={saveCourse}
        disabled={!stage || saveState === 'saving'}
      >
        {saveState === 'saving' ? t('courseEditor.saving') : t('courseEditor.save')}
      </Button>
      <Button type="button" asChild variant="outline" size="sm">
        <Link href={`/classroom/${classroomId}`}>{t('courseEditor.preview')}</Link>
      </Button>
    </>
  );

  return (
    <div
      ref={editorRootRef}
      className={cn('flex-1 flex overflow-hidden min-h-0 bg-gray-50 dark:bg-gray-900')}
    >
      <SceneListEditor />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative">
        <Header
          currentSceneTitle={currentScene?.title || stage?.name || t('courseEditor.title')}
          toolbarExtra={toolbarExtra}
        />

        <div
          className="overflow-hidden relative flex-1 min-h-0 isolate"
          style={{ height: sceneViewerHeight }}
          suppressHydrationWarning
        >
          {currentScene ? (
            <CanvasArea
              currentScene={currentScene}
              currentSceneIndex={currentSceneIndex}
              scenesCount={scenes.length}
              mode="autonomous"
              engineState="idle"
              isLiveSession={false}
              whiteboardOpen={whiteboardOpen}
              sidebarCollapsed={sidebarCollapsed}
              chatCollapsed={chatAreaCollapsed}
              onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
              onToggleChat={() => setChatAreaCollapsed(!chatAreaCollapsed)}
              onPrevSlide={handlePreviousScene}
              onNextSlide={handleNextScene}
              onPlayPause={noop}
              onWhiteboardClose={handleWhiteboardToggle}
              isPresenting={false}
              onTogglePresentation={noop}
              showStopDiscussion={false}
              onStopDiscussion={noop}
              hideToolbar
              isPendingScene={false}
              isCourseComplete={false}
              editable
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gray-50 dark:bg-gray-900 text-sm text-muted-foreground">
              {t('courseEditor.noScene')}
            </div>
          )}
        </div>

        <div className="shrink-0">
          <Roundtable
            mode="playback"
            initialParticipants={participants}
            playbackView={playbackView}
            currentSpeech={null}
            lectureSpeech={null}
            idleText={firstSpeechText}
            playbackCompleted={false}
            discussionRequest={null}
            engineMode="idle"
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
            onDiscussionSkip={noop}
            onStopDiscussion={noop}
            onInputActivate={noop}
            onResumeTopic={noop}
            onPlayPause={noop}
            isDiscussionPaused={false}
            onDiscussionPause={noop}
            onDiscussionResume={noop}
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
            onTogglePresentation={noop}
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
      />

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
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

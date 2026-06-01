/**
 * @extends-from components/teacher/course-project-design-shell.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import '@/components/extends/extends-bootstrap-side-effect';
import Link from 'next/link';
import { ArrowLeft, GitBranch, Settings2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { nanoid } from 'nanoid';

import {
  CourseProjectChat,
  type CourseProjectChatMessage,
  type CourseProjectChatToolEvent,
} from '@/components/teacher/course-project-chat';
import { CourseProjectStreamingBanner } from '@/components/teacher/course-project-streaming-banner';
import { CourseOverviewBlock } from '@/components/teacher/design-workbench/course-overview-block';
import { CourseKnowledgeMountBlock } from '@/components/teacher/design-workbench/course-knowledge-mount-block';
import { CourseGenerationSettingsDrawer } from './design-workbench/course-generation-settings-drawer';
import { CourseGenerationFlowSettingsDialog } from '@/components/teacher/design-workbench/course-generation-flow-settings-dialog';
import type { GenerationMode } from '@/lib/slide-templates/types';
import type { GenerationProfile } from '@/lib/teacher/generation-profile';
import type { SlideOutputFormat } from '@/lib/teacher/slide-output-format';
import { patchProjectKnowledgeMount } from '@/lib/knowledge-base/client';
import { ChapterListEditor } from '@/components/teacher/design-workbench/chapter-list-editor';
import { ChapterFailureDetailDialog } from '@/components/teacher/design-workbench/chapter-failure-detail-dialog';
import {
  PersistenceStatusIndicator,
  type PersistenceUiStatus,
} from '@/components/teacher/design-workbench/persistence-status-indicator';
import {
  applyToolCall,
  createDesignShellState,
  type DesignShellState,
  type ToolEvent,
} from '@/lib/teacher/design-shell-reducer';
import type { CourseProject } from '@/lib/teacher/course-types';
import {
  chapterClassroomToUiStateWithStaleGuard,
  chapterClassroomsToUiMapWithStaleGuard,
} from '@/lib/teacher/chapter-classroom-status-sync';
import { markChapterClassroomGenerating } from '@/lib/teacher/chapter-classroom-api';
import { type ChapterClassroomUiState } from '@/lib/teacher/chapter-classroom-ui';
import { useChapterClassroomStatusPolling } from '@/lib/teacher/use-chapter-classroom-status-polling';
import {
  consumeTeacherHomepageRequirement,
  peekTeacherHomepageRequirement,
} from '@/lib/teacher/homepage-handoff';
import {
  readDesignAgentSystemPromptFromStorage,
  writeDesignAgentSystemPromptToStorage,
} from '@/lib/teacher/design-agent-prompt';
import { Button } from '@/components/ui/button';
import {
  buildChapterGeneratePath,
  buildChapterStudioPath,
  buildTeacherDesignPath,
  buildTeacherNewPath,
  buildTeacherProjectsPath,
  buildTeacherStudioPath,
} from '@/lib/teacher/routes';
import { CoursePublishButton } from '@/components/teacher/course-publish-button';
import {
  deleteChapterReference,
  uploadChapterReference,
} from '@/lib/teacher/chapter-reference-client';
import {
  chaptersToPatch,
  createTeacherProject,
  patchTeacherProject,
} from '@/lib/teacher/teacher-projects-client';
import {
  streamCourseProjectRefine,
  type ChatTranscriptMessage,
  type CourseProjectFormState,
  type CourseProjectStreamResult,
} from '@/lib/teacher/teacher-refine-client';
import { useI18n } from '@/lib/hooks/use-i18n';
import {
  designWorkbenchPanelShellClassName,
  designWorkbenchStructureScrollClassName,
} from '@/lib/teacher/design-workbench-layout';
import { useSettingsStore } from '@/lib/store/settings';

const HIGHLIGHT_MS = 2200;
const PATCH_DEBOUNCE_MS = 450;

/** Supersedes in-flight homepage bootstrap when React remounts the shell (Strict Mode). */
let designShellAutoBootstrapGeneration = 0;

function waitTwoAnimationFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  });
}

function projectToDesignState(project: CourseProject): DesignShellState {
  const sorted = [...(project.outline?.chapters ?? [])].sort(
    (left, right) => left.order - right.order,
  );
  const chapters = sorted.map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    learningObjectives: [...chapter.learningObjectives],
    summary: chapter.summary ?? '',
    referenceFiles: [...(chapter.referenceFiles ?? [])],
    deepSearchEnabled: chapter.deepSearchEnabled ?? false,
    knowledgeNodeIds: [...(chapter.knowledgeNodeIds ?? [])],
    slideTemplateId: chapter.slideTemplateId,
    generationMode: chapter.generationMode,
    generationProfileOverride: chapter.generationProfileOverride,
  }));
  let aiCounter = 0;
  for (const chapter of chapters) {
    const match = /^ai-(\d+)$/.exec(chapter.id);
    if (match) aiCounter = Math.max(aiCounter, Number(match[1]));
  }
  return {
    overview: project.overview ?? '',
    chapters,
    aiCounter,
    slideTemplateId: project.slideTemplateId,
    generationMode: project.generationMode,
    generationProfile: project.generationProfile,
  };
}

function deriveProjectTitleFromOverview(overview: string): string {
  const trimmed = overview.trim();
  if (!trimmed) return '';
  const firstLine = trimmed.split(/[\n。.!！?？]/)[0]?.trim() ?? '';
  return firstLine.slice(0, 120);
}

function formSnapshot(state: DesignShellState): CourseProjectFormState {
  return {
    overview: state.overview,
    chapters: state.chapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      learningObjectives: chapter.learningObjectives,
      summary: chapter.summary,
      deepSearchEnabled: chapter.deepSearchEnabled,
      knowledgeNodeIds: chapter.knowledgeNodeIds,
      slideTemplateId: chapter.slideTemplateId,
      generationMode: chapter.generationMode,
      generationProfileOverride: chapter.generationProfileOverride,
    })),
  };
}

function isFreshDesignProject(project: CourseProject): boolean {
  const overview = (project.overview ?? '').trim();
  const chapters = project.outline?.chapters ?? [];
  return overview === '' && chapters.length === 0;
}

function initialDesignChatMessages(
  project: CourseProject | null | undefined,
): CourseProjectChatMessage[] {
  const stored = project?.designWorkbenchChat?.messages;
  return stored && stored.length > 0 ? [...stored] : [];
}

function highlightKeyForToolEvent(event: ToolEvent): string | null {
  switch (event.kind) {
    case 'overviewUpdated':
      return 'overview';
    case 'chapterAdded':
    case 'chapterUpdated':
      return event.affectedChapterId ? `chapter:${event.affectedChapterId}` : null;
    default:
      return null;
  }
}

interface CourseProjectDesignShellProps {
  readonly initialProject?: CourseProject | null;
}

export function CourseProjectDesignShell({ initialProject = null }: CourseProjectDesignShellProps) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();

  const [designState, setDesignState] = useState<DesignShellState>(() =>
    initialProject ? projectToDesignState(initialProject) : createDesignShellState(),
  );
  const [knowledgeMountIds, setKnowledgeMountIds] = useState<string[]>(
    () => initialProject?.knowledge?.mount.nodeIds ?? [],
  );
  const designStateRef = useRef(designState);
  designStateRef.current = designState;

  const projectIdRef = useRef<string | null>(initialProject?.id ?? null);
  const [expandedChapterIds, setExpandedChapterIds] = useState<Set<string>>(() => new Set());

  const [messages, setMessages] = useState<CourseProjectChatMessage[]>(() =>
    initialDesignChatMessages(initialProject),
  );
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flowSettingsOpen, setFlowSettingsOpen] = useState(false);
  const [generationSettingsDrawerOpen, setGenerationSettingsDrawerOpen] = useState(false);

  const baseRequirementRef = useRef('');
  const [hasBaseRequirement, setHasBaseRequirement] = useState(false);
  const [designAgentSystemPrompt, setDesignAgentSystemPrompt] = useState(() =>
    readDesignAgentSystemPromptFromStorage(),
  );
  const designAgentSystemPromptRef = useRef(designAgentSystemPrompt);
  designAgentSystemPromptRef.current = designAgentSystemPrompt;

  const handleDesignAgentSystemPrompt = useCallback((next: string) => {
    setDesignAgentSystemPrompt(next);
    writeDesignAgentSystemPromptToStorage(next);
  }, []);
  /** True only after a bootstrap stream completes successfully (avoids blocking retries on failure). */
  const autoBootstrapCompletedRef = useRef(false);
  const autoBootstrapInFlightRef = useRef(false);

  const [settingsStoreReady, setSettingsStoreReady] = useState(() => {
    if (typeof window === 'undefined') return false;
    const persist = useSettingsStore.persist;
    return typeof persist?.hasHydrated === 'function' ? persist.hasHydrated() : true;
  });

  const modelId = useSettingsStore((s) => s.modelId);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const persist = useSettingsStore.persist;
    if (!persist?.onFinishHydration) {
      setSettingsStoreReady(true);
      return;
    }
    if (typeof persist.hasHydrated === 'function' && persist.hasHydrated()) {
      setSettingsStoreReady(true);
      return;
    }
    return persist.onFinishHydration(() => {
      setSettingsStoreReady(true);
    });
  }, []);

  const chatAbortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<CourseProjectChatMessage[]>(initialDesignChatMessages(initialProject));
  const chatBusyRef = useRef(false);
  const activeAssistantIdRef = useRef<string | null>(null);

  const patchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generateNavLockRef = useRef(false);
  const [pollingProjectId, setPollingProjectId] = useState<string | null>(
    initialProject?.id ?? null,
  );
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceUiStatus>('idle');
  const [generatingChapterId, setGeneratingChapterId] = useState<string | null>(null);
  const [referenceUploadChapterId, setReferenceUploadChapterId] = useState<string | null>(null);
  const [chapterClassroomByChapterId, setChapterClassroomByChapterId] = useState<
    Record<string, ChapterClassroomUiState>
  >(() => chapterClassroomsToUiMapWithStaleGuard(initialProject?.chapterClassrooms));

  const [failureDialogChapterId, setFailureDialogChapterId] = useState<string | null>(null);

  const flashHighlight = useCallback((key: string | null) => {
    if (!key) return;
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightKey(key);
    highlightTimerRef.current = setTimeout(() => {
      highlightTimerRef.current = null;
      setHighlightKey((current) => (current === key ? null : current));
    }, HIGHLIGHT_MS);
  }, []);

  const flushPatch = useCallback(async () => {
    const projectId = projectIdRef.current;
    if (!projectId) return;
    const snapshot = designStateRef.current;
    setPersistenceStatus('saving');
    try {
      const title = deriveProjectTitleFromOverview(snapshot.overview);
      const chatMessages = messagesRef.current;
      const { idMapping } = await patchTeacherProject(projectId, {
        ...(title ? { title } : {}),
        overview: snapshot.overview,
        chapters: chaptersToPatch(snapshot.chapters),
        ...(chatMessages.length > 0 ? { designWorkbenchChat: { messages: chatMessages } } : {}),
      });
      if (idMapping && Object.keys(idMapping).length > 0) {
        const mapped = snapshot.chapters.map((chapter) => ({
          ...chapter,
          id: idMapping[chapter.id] ?? chapter.id,
        }));
        const next: DesignShellState = { ...snapshot, chapters: mapped };
        designStateRef.current = next;
        setDesignState(next);
      }
      setPersistenceStatus('saved');
      window.setTimeout(() => setPersistenceStatus('idle'), 1800);
    } catch {
      setPersistenceStatus('error');
    }
  }, []);

  const schedulePatch = useCallback(() => {
    if (!projectIdRef.current) return;
    if (patchTimerRef.current) clearTimeout(patchTimerRef.current);
    patchTimerRef.current = setTimeout(() => {
      patchTimerRef.current = null;
      void flushPatch();
    }, PATCH_DEBOUNCE_MS);
  }, [flushPatch]);

  const ensureProjectPersisted = useCallback(async (): Promise<boolean> => {
    if (projectIdRef.current) return true;
    const snapshot = designStateRef.current;
    if (!snapshot.overview.trim() || snapshot.chapters.length === 0) return false;
    if (!snapshot.chapters.some((chapter) => chapter.title.trim())) return false;
    try {
      const project = await createTeacherProject({
        requirement: baseRequirementRef.current.trim() || snapshot.overview.trim(),
        overview: snapshot.overview.trim(),
        chapters: snapshot.chapters.map((chapter) => ({
          title: chapter.title.trim(),
          learningObjectives: chapter.learningObjectives.map((line) => line.trim()).filter(Boolean),
          summary: chapter.summary.trim() || undefined,
        })),
      });
      projectIdRef.current = project.id;
      setPollingProjectId(project.id);
      const handoff = peekTeacherHomepageRequirement();
      if (handoff?.knowledgeNodeIds?.length) {
        await patchProjectKnowledgeMount(project.id, handoff.knowledgeNodeIds);
        setKnowledgeMountIds(handoff.knowledgeNodeIds);
      }
      const next = projectToDesignState(project);
      designStateRef.current = next;
      setDesignState(next);
      if (messagesRef.current.length > 0) {
        await patchTeacherProject(project.id, {
          designWorkbenchChat: { messages: messagesRef.current },
        });
      }
      router.replace(buildTeacherDesignPath(project.id));
      return true;
    } catch {
      setPersistenceStatus('error');
      return false;
    }
  }, [router]);

  const recordToolEventOnAssistant = useCallback(
    (assistantId: string, event: CourseProjectChatToolEvent) => {
      setMessages((current) => {
        const next = current.map((message) => {
          if (message.id !== assistantId) return message;
          return {
            ...message,
            toolEvents: [...(message.toolEvents ?? []), event],
          };
        });
        messagesRef.current = next;
        return next;
      });
      schedulePatch();
    },
    [schedulePatch],
  );

  const appendReplyDelta = useCallback((assistantId: string, delta: string) => {
    setMessages((current) => {
      const next = current.map((message) =>
        message.id === assistantId ? { ...message, content: message.content + delta } : message,
      );
      messagesRef.current = next;
      return next;
    });
  }, []);

  const appendReasoningDelta = useCallback((assistantId: string, delta: string) => {
    setMessages((current) => {
      const next = current.map((message) =>
        message.id === assistantId
          ? { ...message, reasoning: (message.reasoning ?? '') + delta }
          : message,
      );
      messagesRef.current = next;
      return next;
    });
  }, []);

  const finalizeAssistantMessage = useCallback(
    (assistantId: string) => {
      setMessages((current) => {
        const next = current.map((message) => {
          if (message.id !== assistantId) return message;
          if (message.content.trim() || (message.toolEvents && message.toolEvents.length > 0)) {
            return message;
          }
          return {
            ...message,
            content: message.cancelled
              ? t('teacher.create.chat.cancelledFallback')
              : t('teacher.create.chat.emptyReplyFallback'),
          };
        });
        messagesRef.current = next;
        return next;
      });
      setStreamingId((current) => (current === assistantId ? null : current));
      activeAssistantIdRef.current = null;
    },
    [t],
  );

  const applyIncomingToolCall = useCallback(
    (assistantId: string, call: { toolName: string; input: unknown }) => {
      const { state, event } = applyToolCall(designStateRef.current, call);
      designStateRef.current = state;
      setDesignState(state);
      if (event) {
        const toolEvent: CourseProjectChatToolEvent = {
          id: event.id,
          kind: event.kind,
          label: event.label,
          reason: event.reason,
        };
        recordToolEventOnAssistant(assistantId, toolEvent);
        const highlight = highlightKeyForToolEvent(event);
        if (highlight === 'overview') flashHighlight('overview');
        else if (highlight?.startsWith('chapter:')) {
          const id = highlight.slice('chapter:'.length);
          flashHighlight(`chapter:${id}`);
          if (event.kind === 'chapterAdded') {
            setExpandedChapterIds((current) => new Set(current).add(id));
          }
        }
      }
    },
    [flashHighlight, recordToolEventOnAssistant],
  );

  const runStreamingTurn = useCallback(
    async (
      preparedMessages: CourseProjectChatMessage[],
    ): Promise<CourseProjectStreamResult['status'] | 'skipped'> => {
      if (chatBusyRef.current) return 'skipped';
      if (preparedMessages.length === 0) return 'skipped';
      const last = preparedMessages[preparedMessages.length - 1];
      if (last.role !== 'user') return 'skipped';

      const assistantMessage: CourseProjectChatMessage = {
        id: nanoid(),
        role: 'assistant',
        content: '',
        toolEvents: [],
      };
      const transcript: ChatTranscriptMessage[] = preparedMessages.map((message) => ({
        role: message.role,
        content: message.content,
      }));
      const nextMessages = [...preparedMessages, assistantMessage];

      messagesRef.current = nextMessages;
      setMessages(nextMessages);
      setStreamingId(assistantMessage.id);
      activeAssistantIdRef.current = assistantMessage.id;
      chatBusyRef.current = true;
      setChatBusy(true);
      setChatError(null);

      chatAbortRef.current?.abort();
      const controller = new AbortController();
      chatAbortRef.current = controller;

      const result = await streamCourseProjectRefine({
        formState: formSnapshot(designStateRef.current),
        messages: transcript,
        baseRequirement: baseRequirementRef.current,
        systemInstructions: designAgentSystemPromptRef.current,
        signal: controller.signal,
        callbacks: {
          onReplyDelta: (delta) => appendReplyDelta(assistantMessage.id, delta),
          onReasoningDelta: (delta) => appendReasoningDelta(assistantMessage.id, delta),
          onToolCall: (call) => applyIncomingToolCall(assistantMessage.id, call),
          onDone: () => finalizeAssistantMessage(assistantMessage.id),
          onError: (error) => {
            setChatError(error || t('teacher.create.chat.error'));
          },
        },
      });

      chatBusyRef.current = false;
      setChatBusy(false);
      if (result.status === 'aborted') {
        finalizeAssistantMessage(assistantMessage.id);
      } else if (result.status === 'failed') {
        finalizeAssistantMessage(assistantMessage.id);
        setChatError((current) => current || result.error || t('teacher.create.chat.error'));
      }

      await ensureProjectPersisted();
      schedulePatch();
      return result.status;
    },
    [
      appendReasoningDelta,
      appendReplyDelta,
      applyIncomingToolCall,
      ensureProjectPersisted,
      finalizeAssistantMessage,
      schedulePatch,
      t,
    ],
  );

  const sendChatMessage = useCallback(
    async (text: string): Promise<CourseProjectStreamResult['status'] | 'skipped'> => {
      const trimmed = text.trim();
      if (!trimmed || chatBusyRef.current) return 'skipped';
      const userMessage: CourseProjectChatMessage = {
        id: nanoid(),
        role: 'user',
        content: trimmed,
      };
      return await runStreamingTurn([...messagesRef.current, userMessage]);
    },
    [runStreamingTurn],
  );

  const cancelStream = useCallback(() => {
    if (!chatBusyRef.current) return;
    const activeId = activeAssistantIdRef.current;
    if (activeId) {
      setMessages((current) => {
        const next = current.map((message) =>
          message.id === activeId ? { ...message, cancelled: true } : message,
        );
        messagesRef.current = next;
        return next;
      });
    }
    chatAbortRef.current?.abort();
    schedulePatch();
  }, [schedulePatch]);

  const retryLastTurn = useCallback(async () => {
    if (chatBusyRef.current) return;
    const lastUserIdx = findLastIndex(messagesRef.current, (message) => message.role === 'user');
    if (lastUserIdx === -1) return;
    const trimmed = messagesRef.current.slice(0, lastUserIdx + 1);
    messagesRef.current = trimmed;
    setMessages(trimmed);
    setChatError(null);
    await runStreamingTurn(trimmed);
  }, [runStreamingTurn]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!settingsStoreReady) return;
    if (!modelId?.trim()) return;
    if (autoBootstrapCompletedRef.current) return;
    if (autoBootstrapInFlightRef.current) return;
    if (messagesRef.current.length > 0) return;

    const handoff = peekTeacherHomepageRequirement();
    const fromSession = handoff?.requirement?.trim() ?? '';

    let fromProject = '';
    if (initialProject?.id && !fromSession) {
      const requirement = initialProject.requirements?.requirement?.trim();
      if (requirement && isFreshDesignProject(initialProject)) fromProject = requirement;
    }

    const bootstrapText = fromSession || fromProject;
    if (!bootstrapText) return;

    const generation = (designShellAutoBootstrapGeneration += 1);
    autoBootstrapInFlightRef.current = true;
    baseRequirementRef.current = bootstrapText;
    queueMicrotask(() => {
      setHasBaseRequirement(bootstrapText.trim().length > 0);
    });

    void (async () => {
      try {
        await waitTwoAnimationFrames();
        if (generation !== designShellAutoBootstrapGeneration) return;

        const status = await sendChatMessage(bootstrapText);
        if (generation !== designShellAutoBootstrapGeneration) return;

        if (status === 'completed') {
          autoBootstrapCompletedRef.current = true;
          if (fromSession) consumeTeacherHomepageRequirement();
        }
      } finally {
        autoBootstrapInFlightRef.current = false;
      }
    })();
  }, [initialProject, modelId, sendChatMessage, settingsStoreReady]);

  useEffect(() => {
    if (!initialProject?.id) return;
    projectIdRef.current = initialProject.id;
    setPollingProjectId(initialProject.id);
    const next = projectToDesignState(initialProject);
    designStateRef.current = next;
    setDesignState(next);
    setChapterClassroomByChapterId(
      chapterClassroomsToUiMapWithStaleGuard(initialProject.chapterClassrooms),
    );
    setKnowledgeMountIds(initialProject.knowledge?.mount.nodeIds ?? []);
    const chat = initialProject.designWorkbenchChat?.messages;
    if (chat && chat.length > 0) {
      const restored = [...chat];
      messagesRef.current = restored;
      setMessages(restored);
      autoBootstrapCompletedRef.current = true;
    }
  }, [initialProject]);

  useEffect(() => {
    return () => {
      chatAbortRef.current?.abort();
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      if (patchTimerRef.current) clearTimeout(patchTimerRef.current);
    };
  }, []);

  const chapterIdsForPolling = designState.chapters.map((chapter) => chapter.id);

  const handleChapterNoLongerActive = useCallback((chapterId: string) => {
    setGeneratingChapterId((current) => (current === chapterId ? null : current));
    generateNavLockRef.current = false;
  }, []);

  useChapterClassroomStatusPolling({
    projectId: pollingProjectId,
    chapterIds: chapterIdsForPolling,
    statuses: chapterClassroomByChapterId,
    setStatuses: setChapterClassroomByChapterId,
    pinnedGeneratingChapterId: generatingChapterId,
    onChapterNoLongerActive: handleChapterNoLongerActive,
  });

  const updateOverview = (overview: string) => {
    const next: DesignShellState = { ...designStateRef.current, overview };
    designStateRef.current = next;
    setDesignState(next);
    schedulePatch();
  };

  const updateChapter = useCallback(
    (
      chapterId: string,
      patch: Partial<
        Pick<
          DesignShellState['chapters'][number],
          | 'title'
          | 'learningObjectives'
          | 'summary'
          | 'deepSearchEnabled'
          | 'knowledgeNodeIds'
          | 'slideTemplateId'
          | 'generationMode'
          | 'generationProfileOverride'
        >
      >,
    ) => {
      const snapshot = designStateRef.current;
      const chapters = snapshot.chapters.map((chapter) => {
        if (chapter.id !== chapterId) return chapter;
        const next = { ...chapter, ...patch };
        if ('slideTemplateId' in patch && patch.slideTemplateId === undefined) {
          delete next.slideTemplateId;
        }
        if ('generationMode' in patch && patch.generationMode === undefined) {
          delete next.generationMode;
        }
        if ('generationProfileOverride' in patch && patch.generationProfileOverride === undefined) {
          delete next.generationProfileOverride;
        }
        return next;
      });
      const next: DesignShellState = { ...snapshot, chapters };
      designStateRef.current = next;
      setDesignState(next);
      schedulePatch();
    },
    [schedulePatch],
  );

  const applyGenerationSettingsPatch = useCallback(
    (patch: {
      slideTemplateId?: string;
      generationMode?: GenerationMode;
      slideOutputFormat?: SlideOutputFormat;
      generationProfile?: GenerationProfile;
    }) => {
      const next: DesignShellState = { ...designStateRef.current };
      if ('slideTemplateId' in patch) {
        if (patch.slideTemplateId !== undefined) {
          next.slideTemplateId = patch.slideTemplateId;
        } else {
          delete next.slideTemplateId;
        }
      }
      if ('generationMode' in patch) {
        if (patch.generationMode !== undefined) {
          next.generationMode = patch.generationMode;
        } else {
          delete next.generationMode;
        }
      }
      if (patch.generationProfile) {
        next.generationProfile = patch.generationProfile;
      }
      designStateRef.current = next;
      setDesignState(next);
    },
    [],
  );

  const addChapter = () => {
    const snapshot = designStateRef.current;
    const id = nanoid();
    const next: DesignShellState = {
      ...snapshot,
      chapters: [
        ...snapshot.chapters,
        {
          id,
          title: '',
          learningObjectives: [''],
          summary: '',
          referenceFiles: [],
          deepSearchEnabled: false,
          knowledgeNodeIds: [],
        },
      ],
    };
    designStateRef.current = next;
    setDesignState(next);
    setExpandedChapterIds((current) => new Set(current).add(id));
    schedulePatch();
  };

  const removeChapter = (chapterId: string) => {
    const snapshot = designStateRef.current;
    const next: DesignShellState = {
      ...snapshot,
      chapters: snapshot.chapters.filter((chapter) => chapter.id !== chapterId),
    };
    designStateRef.current = next;
    setDesignState(next);
    setExpandedChapterIds((current) => {
      const copy = new Set(current);
      copy.delete(chapterId);
      return copy;
    });
    schedulePatch();
  };

  const moveChapter = (chapterId: string, direction: 'up' | 'down') => {
    const snapshot = designStateRef.current;
    const index = snapshot.chapters.findIndex((chapter) => chapter.id === chapterId);
    if (index === -1) return;
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= snapshot.chapters.length) return;
    const chapters = [...snapshot.chapters];
    const temp = chapters[index];
    chapters[index] = chapters[target]!;
    chapters[target] = temp!;
    const next: DesignShellState = { ...snapshot, chapters };
    designStateRef.current = next;
    setDesignState(next);
    schedulePatch();
  };

  const toggleExpand = (chapterId: string) => {
    setExpandedChapterIds((current) => {
      const copy = new Set(current);
      if (copy.has(chapterId)) copy.delete(chapterId);
      else copy.add(chapterId);
      return copy;
    });
  };

  const chapterCanGenerate = useCallback((chapter: DesignShellState['chapters'][number]) => {
    return Boolean(chapter.title.trim() && chapter.learningObjectives.some((line) => line.trim()));
  }, []);

  const goToChapterGeneration = useCallback(
    async (chapterId: string, options?: { resume?: boolean; regenerate?: boolean }) => {
      if (chatBusyRef.current) return;
      generateNavLockRef.current = false;

      const chapter = designStateRef.current.chapters.find((item) => item.id === chapterId);
      if (!chapter || !chapterCanGenerate(chapter)) return;

      const ok = await ensureProjectPersisted();
      if (!ok) return;
      await flushPatch();

      const projectId = projectIdRef.current;
      if (!projectId) return;

      const chapterUi = chapterClassroomByChapterId[chapterId];
      const generateOptions = options?.regenerate
        ? { regenerate: true as const }
        : options?.resume
          ? { resume: true as const }
          : chapterUi?.status === 'failed'
            ? { resume: true as const }
            : chapterUi?.status === 'ready' || chapterUi?.status === 'published'
              ? { regenerate: true as const }
              : undefined;

      setGeneratingChapterId(chapterId);
      setChapterClassroomByChapterId((prev) => ({
        ...prev,
        [chapterId]: {
          status: 'generating',
          sceneCount: prev[chapterId]?.sceneCount,
        },
      }));

      const resetClassroom = await markChapterClassroomGenerating(projectId, chapterId);
      if (resetClassroom) {
        const ui = chapterClassroomToUiStateWithStaleGuard(resetClassroom);
        if (ui) {
          setChapterClassroomByChapterId((prev) => ({ ...prev, [chapterId]: ui }));
        }
      }

      generateNavLockRef.current = true;
      try {
        router.push(buildChapterGeneratePath(projectId, chapterId, generateOptions));
      } catch {
        generateNavLockRef.current = false;
        setGeneratingChapterId(null);
      }
    },
    [chapterCanGenerate, chapterClassroomByChapterId, ensureProjectPersisted, flushPatch, router],
  );

  const goToChapterStudio = useCallback(
    (chapterId: string) => {
      const projectId = projectIdRef.current;
      if (!projectId) return;
      void router.push(buildChapterStudioPath(projectId, chapterId));
    },
    [router],
  );

  const uploadChapterReferenceFile = useCallback(
    async (chapterId: string, file: File) => {
      if (chatBusyRef.current) return;
      const ok = await ensureProjectPersisted();
      if (!ok) return;
      await flushPatch();
      const projectId = projectIdRef.current;
      const chapter = designStateRef.current.chapters.find((entry) => entry.id === chapterId);
      if (!projectId || !chapter) return;
      setReferenceUploadChapterId(chapter.id);
      try {
        const referenceFile = await uploadChapterReference(projectId, chapter.id, file);
        const snapshot = designStateRef.current;
        const chapters = snapshot.chapters.map((entry) =>
          entry.id === chapter.id
            ? { ...entry, referenceFiles: [...entry.referenceFiles, referenceFile] }
            : entry,
        );
        const next: DesignShellState = { ...snapshot, chapters };
        designStateRef.current = next;
        setDesignState(next);
      } finally {
        setReferenceUploadChapterId(null);
      }
    },
    [ensureProjectPersisted, flushPatch],
  );

  const removeChapterReferenceFile = useCallback(async (chapterId: string, fileId: string) => {
    if (chatBusyRef.current) return;
    const projectId = projectIdRef.current;
    const chapter = designStateRef.current.chapters.find((entry) => entry.id === chapterId);
    if (!projectId || !chapter) return;
    await deleteChapterReference(projectId, chapter.id, fileId);
    const snapshot = designStateRef.current;
    const chapters = snapshot.chapters.map((entry) =>
      entry.id === chapter.id
        ? {
            ...entry,
            referenceFiles: entry.referenceFiles.filter((file) => file.id !== fileId),
          }
        : entry,
    );
    const next: DesignShellState = { ...snapshot, chapters };
    designStateRef.current = next;
    setDesignState(next);
  }, []);

  const regenerateDraft = () => {
    if (chatBusyRef.current) return;
    const base = baseRequirementRef.current.trim();
    if (!base) return;
    const cleared = createDesignShellState();
    designStateRef.current = cleared;
    setDesignState(cleared);
    projectIdRef.current = null;
    if (pathname?.includes('/teacher/projects/') && pathname.includes('/design')) {
      router.replace(buildTeacherNewPath());
    }
    void sendChatMessage(base);
  };

  const canRetryChat = !chatBusy && messages.some((message) => message.role === 'user');

  const overviewHot = highlightKey === 'overview';

  const workflowSteps = [
    t('teacher.create.designWorkbench.workflowEdit'),
    t('teacher.create.designWorkbench.workflowAi'),
    t('teacher.create.designWorkbench.workflowPublish'),
  ] as const;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50 px-6 py-10 text-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-purple-950 dark:text-slate-50 lg:flex lg:h-dvh lg:min-h-0 lg:flex-col lg:overflow-hidden">
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 lg:min-h-0 lg:overflow-hidden">
        <header className="flex shrink-0 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button type="button" variant="ghost" size="icon" className="shrink-0" asChild>
                <Link href={buildTeacherProjectsPath()} aria-label={t('teacher.projects.viewAll')}>
                  <ArrowLeft className="size-4" />
                </Link>
              </Button>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  {t('teacher.create.designWorkbench.pageEyebrow')}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {t('teacher.create.designWorkbench.pageSubtitle')}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <Button type="button" asChild variant="outline" size="sm" className="h-8">
                <Link href="/home">{t('courseEditor.backToHome')}</Link>
              </Button>
              <Button type="button" asChild variant="outline" size="sm" className="h-8">
                <Link href={buildTeacherProjectsPath()}>{t('teacher.projects.viewAll')}</Link>
              </Button>
              {initialProject?.id && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={chatBusy}
                  onClick={() => setFlowSettingsOpen(true)}
                >
                  <GitBranch className="mr-1.5 size-3.5" aria-hidden />
                  {t('teacher.design.generationWorkflow.headerButton')}
                </Button>
              )}
              {initialProject && (
                <CoursePublishButton
                  project={initialProject}
                  liveChapterStatuses={Object.fromEntries(
                    Object.entries(chapterClassroomByChapterId).map(([id, ui]) => [id, ui.status]),
                  )}
                  onPublishSuccess={() => {
                    const projectId = projectIdRef.current;
                    if (projectId) void router.push(buildTeacherStudioPath(projectId));
                  }}
                />
              )}
              <PersistenceStatusIndicator status={persistenceStatus} />
            </div>
          </div>

          {initialProject?.id ? (
            <CourseGenerationFlowSettingsDialog
              open={flowSettingsOpen}
              onOpenChange={setFlowSettingsOpen}
              projectId={initialProject.id}
              generationProfile={designState.generationProfile ?? initialProject.generationProfile}
              onUpdated={(profile: GenerationProfile) => {
                const next: DesignShellState = {
                  ...designStateRef.current,
                  generationProfile: profile,
                };
                designStateRef.current = next;
                setDesignState(next);
              }}
              disabled={chatBusy}
            />
          ) : null}

          <ol
            className="flex flex-wrap gap-2 pl-12"
            aria-label={t('teacher.create.designWorkbench.workflowAriaLabel')}
          >
            {workflowSteps.map((label, index) => (
              <li
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full border border-violet-200/70 bg-violet-50/80 px-2.5 py-1 text-[11px] font-medium text-violet-800 dark:border-violet-800/50 dark:bg-violet-950/40 dark:text-violet-200"
              >
                <span
                  className="flex size-4 shrink-0 items-center justify-center rounded-full bg-violet-600/10 text-[10px] tabular-nums text-violet-700 dark:bg-violet-400/15 dark:text-violet-300"
                  aria-hidden
                >
                  {index + 1}
                </span>
                {label}
              </li>
            ))}
          </ol>
        </header>

        <CourseProjectStreamingBanner visible={chatBusy} onCancel={cancelStream} />

        <div className="flex min-h-0 flex-1 flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(440px,520px)] lg:items-stretch xl:grid-cols-[minmax(0,1fr)_540px]">
          <section
            className={`${designWorkbenchPanelShellClassName} rounded-xl border border-slate-200/80 bg-white/70 shadow-sm backdrop-blur-sm dark:border-slate-800/80 dark:bg-slate-900/50`}
            aria-label={t('teacher.create.designWorkbench.panelStructure')}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200/60 px-4 py-3 dark:border-slate-800/60">
              <div className="min-w-0">
                <h2 className="text-sm font-medium">{t('teacher.create.designWorkbench.panelStructure')}</h2>
                <p className="text-xs text-muted-foreground">
                  {t('teacher.create.designWorkbench.panelStructureHint')}
                </p>
              </div>
              {initialProject?.id ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={chatBusy}
                  data-testid="teacher-design-generation-settings-menu"
                  onClick={() => setGenerationSettingsDrawerOpen(true)}
                >
                  <Settings2 className="size-3.5" />
                  <span className="ml-1">{t('teacher.design.generationSettings.title')}</span>
                </Button>
              ) : null}
            </div>
            <div className={`${designWorkbenchStructureScrollClassName} px-4 py-4`}>
              <CourseOverviewBlock
                value={designState.overview}
                onChange={updateOverview}
                disabled={chatBusy}
                highlighted={overviewHot}
              />
              {initialProject?.id ? (
                <CourseKnowledgeMountBlock
                  projectId={initialProject.id}
                  selectedNodeIds={knowledgeMountIds}
                  onUpdated={setKnowledgeMountIds}
                  disabled={chatBusy}
                  className="mt-3"
                />
              ) : null}
              <ChapterListEditor
                projectId={initialProject?.id}
                courseSlideTemplateId={designState.slideTemplateId}
                courseGenerationMode={designState.generationMode}
                courseGenerationProfile={designState.generationProfile}
                chapters={designState.chapters}
                expandedChapterIds={expandedChapterIds}
                onToggleExpand={toggleExpand}
                onChapterChange={updateChapter}
                onAddChapter={addChapter}
                onRemoveChapter={removeChapter}
                onMoveChapter={moveChapter}
                onGenerateChapter={(chapterId, options) =>
                  void goToChapterGeneration(chapterId, options)
                }
                generatingChapterId={generatingChapterId}
                canGenerateChapter={chapterCanGenerate}
                disabled={chatBusy}
                highlightedChapterId={
                  highlightKey?.startsWith('chapter:') ? highlightKey.slice('chapter:'.length) : null
                }
                chapterClassroomStatuses={Object.fromEntries(
                  Object.entries(chapterClassroomByChapterId).map(([id, ui]) => [id, ui.status]),
                )}
                chapterClassroomMeta={chapterClassroomByChapterId}
                onShowChapterFailure={(chapterId) => setFailureDialogChapterId(chapterId)}
                onGoToChapterStudio={goToChapterStudio}
                onUploadChapterReference={(chapterId, file) =>
                  void uploadChapterReferenceFile(chapterId, file)
                }
                onRemoveChapterReference={(chapterId, fileId) =>
                  void removeChapterReferenceFile(chapterId, fileId)
                }
                referenceUploadChapterId={referenceUploadChapterId}
              />
            </div>
          </section>

          <section
            className={`${designWorkbenchPanelShellClassName} min-h-[560px] lg:min-h-0`}
            aria-label={t('teacher.create.chat.title')}
          >
            <CourseProjectChat
              className="h-full min-h-0 max-h-none flex-1"
              messages={messages}
              streamingId={streamingId}
              busy={chatBusy}
              disabled={chatBusy}
              errorMessage={chatError}
              onSendMessage={sendChatMessage}
              onCancel={cancelStream}
              onRetry={canRetryChat ? retryLastTurn : undefined}
              onRegenerate={hasBaseRequirement ? regenerateDraft : undefined}
              agentSystemPrompt={designAgentSystemPrompt}
              onAgentSystemPromptChange={handleDesignAgentSystemPrompt}
            />
          </section>
        </div>
      </div>

      {initialProject?.id ? (
        <CourseGenerationSettingsDrawer
          projectId={initialProject.id}
          open={generationSettingsDrawerOpen}
          onOpenChange={setGenerationSettingsDrawerOpen}
          slideTemplateId={designState.slideTemplateId}
          generationMode={designState.generationMode}
          slideOutputFormat={designState.generationProfile?.slideOutputFormat ?? 'canvas'}
          generationProfile={designState.generationProfile}
          onUpdated={applyGenerationSettingsPatch}
          disabled={chatBusy}
        />
      ) : null}

      <ChapterFailureDetailDialog
        open={failureDialogChapterId !== null}
        onOpenChange={(open) => {
          if (!open) setFailureDialogChapterId(null);
        }}
        chapterTitle={
          designState.chapters.find((chapter) => chapter.id === failureDialogChapterId)?.title ??
          failureDialogChapterId ??
          ''
        }
        state={
          failureDialogChapterId
            ? (chapterClassroomByChapterId[failureDialogChapterId] ?? null)
            : null
        }
      />

    </main>
  );
}

function findLastIndex<T>(
  array: readonly T[],
  predicate: (value: T, index: number) => boolean,
): number {
  for (let index = array.length - 1; index >= 0; index--) {
    if (predicate(array[index]!, index)) return index;
  }
  return -1;
}

/**
 * @extends-from components/chat/lecture-notes-view.tsx
 * @fork-branch feat/html-slide-design-workbench
 *
 * Studio 可编辑旁白：增删段落、上下移动、防抖写回 Scene.actions。
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Flashlight,
  MessageSquare,
  MousePointer2,
  Play,
  Plus,
  Trash2,
} from 'lucide-react';

import { LectureNotesView as ReadonlyLectureNotesView } from '../../chat/lecture-notes-view';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { generateId } from '@/lib/api/stage-api-defaults';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useStageStore } from '@/lib/store/stage';
import type { Action, DiscussionAction, SpeechAction } from '@/lib/types/action';
import type { LectureNoteEntry } from '@/lib/types/chat';
import type { Scene } from '@/lib/types/stage';
import { cn } from '@/lib/utils';

const ACTION_ICON_ONLY: Record<string, { Icon: typeof Flashlight; style: string }> = {
  spotlight: {
    Icon: Flashlight,
    style:
      'bg-yellow-50 dark:bg-yellow-500/15 border-yellow-300/40 dark:border-yellow-500/30 text-yellow-700 dark:text-yellow-300',
  },
  laser: {
    Icon: MousePointer2,
    style:
      'bg-red-50 dark:bg-red-500/15 border-red-300/40 dark:border-red-500/30 text-red-600 dark:text-red-300',
  },
  play_video: {
    Icon: Play,
    style:
      'bg-yellow-50 dark:bg-yellow-500/15 border-yellow-300/40 dark:border-yellow-500/30 text-yellow-700 dark:text-yellow-300',
  },
};

const NOTE_ACTION_TYPES = new Set(['speech', 'spotlight', 'laser', 'play_video', 'discussion']);

interface LectureNotesViewProps {
  notes: LectureNoteEntry[];
  currentSceneId?: string | null;
  /** Studio editor: edit speech paragraphs in Scene.actions. */
  editable?: boolean;
}

function ActionBadge({ type }: { type: string }) {
  const cfg = ACTION_ICON_ONLY[type];
  if (!cfg) return null;
  const { Icon, style } = cfg;
  return (
    <span
      className={cn(
        'inline-flex h-5 w-5 items-center justify-center rounded-full border align-middle',
        style,
      )}
    >
      <Icon className="h-3 w-3" />
    </span>
  );
}

function EditableSpeechRow({
  sceneId,
  action,
  actionIndex,
  actionCount,
  onTextCommit,
  onMove,
  onDeleteRequest,
}: {
  sceneId: string;
  action: SpeechAction;
  actionIndex: number;
  actionCount: number;
  onTextCommit: (sceneId: string, actionId: string, text: string) => void;
  onMove: (sceneId: string, actionIndex: number, direction: 'up' | 'down') => void;
  onDeleteRequest: (sceneId: string, actionId: string) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(action.text);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const handleChange = (value: string) => {
    setDraft(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onTextCommit(sceneId, action.id, value);
    }, 300);
  };

  return (
    <div className="group rounded-md border border-border/50 bg-background/80 p-2">
      <Textarea
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        className="min-h-[4.5rem] resize-y border-0 bg-transparent p-0 text-[12px] leading-relaxed shadow-none focus-visible:ring-0"
        aria-label={t('chat.lectureNotes.editSpeech')}
      />
      <div className="mt-1.5 flex items-center justify-end gap-0.5 opacity-80 group-hover:opacity-100">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          disabled={actionIndex <= 0}
          aria-label={t('chat.lectureNotes.moveParagraphUp')}
          onClick={() => onMove(sceneId, actionIndex, 'up')}
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          disabled={actionIndex >= actionCount - 1}
          aria-label={t('chat.lectureNotes.moveParagraphDown')}
          onClick={() => onMove(sceneId, actionIndex, 'down')}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-destructive hover:text-destructive"
          aria-label={t('chat.lectureNotes.deleteParagraph')}
          onClick={() => onDeleteRequest(sceneId, action.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function EditableLectureNotesView({ currentSceneId }: { currentSceneId?: string | null }) {
  const { t } = useI18n();
  const scenes = useStageStore((s) => s.scenes);
  const updateScene = useStageStore((s) => s.updateScene);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pendingDelete, setPendingDelete] = useState<{ sceneId: string; actionId: string } | null>(
    null,
  );

  const sortedScenes = useMemo(
    () => [...scenes].sort((a, b) => a.order - b.order),
    [scenes],
  );

  useEffect(() => {
    if (!currentSceneId || !containerRef.current) return;
    const el = containerRef.current.querySelector(`[data-scene-id="${currentSceneId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentSceneId]);

  const patchSceneActions = useCallback(
    (sceneId: string, updater: (actions: Action[]) => Action[]) => {
      const scene = useStageStore.getState().scenes.find((s) => s.id === sceneId);
      if (!scene) return;
      const actions = updater([...(scene.actions ?? [])]);
      updateScene(sceneId, { actions, updatedAt: Date.now() });
    },
    [updateScene],
  );

  const commitSpeechText = useCallback(
    (sceneId: string, actionId: string, text: string) => {
      patchSceneActions(sceneId, (actions) =>
        actions.map((a) => (a.id === actionId && a.type === 'speech' ? { ...a, text } : a)),
      );
    },
    [patchSceneActions],
  );

  const moveAction = useCallback(
    (sceneId: string, actionIndex: number, direction: 'up' | 'down') => {
      patchSceneActions(sceneId, (actions) => {
        const targetIndex = direction === 'up' ? actionIndex - 1 : actionIndex + 1;
        if (targetIndex < 0 || targetIndex >= actions.length) return actions;
        const next = [...actions];
        const current = next[actionIndex]!;
        next[actionIndex] = next[targetIndex]!;
        next[targetIndex] = current;
        return next;
      });
    },
    [patchSceneActions],
  );

  const confirmDelete = useCallback(() => {
    if (!pendingDelete) return;
    const { sceneId, actionId } = pendingDelete;
    patchSceneActions(sceneId, (actions) => actions.filter((a) => a.id !== actionId));
    setPendingDelete(null);
  }, [patchSceneActions, pendingDelete]);

  const addSpeechParagraph = useCallback(
    (sceneId: string) => {
      patchSceneActions(sceneId, (actions) => [
        ...actions,
        { id: generateId('action'), type: 'speech', text: '' } satisfies SpeechAction,
      ]);
    },
    [patchSceneActions],
  );

  if (sortedScenes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <BookOpen className="mb-3 h-8 w-8 text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground">{t('chat.lectureNotes.emptyEditor')}</p>
      </div>
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 scrollbar-hide"
      >
        {sortedScenes.map((scene, index) => (
          <EditableSceneNotes
            key={scene.id}
            scene={scene}
            pageNum={index + 1}
            isCurrent={scene.id === currentSceneId}
            onTextCommit={commitSpeechText}
            onMove={moveAction}
            onDeleteRequest={(sceneId, actionId) => setPendingDelete({ sceneId, actionId })}
            onAddParagraph={addSpeechParagraph}
          />
        ))}
      </div>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('chat.lectureNotes.deleteParagraphConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('chat.lectureNotes.deleteParagraphConfirmDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              {t('chat.lectureNotes.deleteParagraph')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function EditableSceneNotes({
  scene,
  pageNum,
  isCurrent,
  onTextCommit,
  onMove,
  onDeleteRequest,
  onAddParagraph,
}: {
  scene: Scene;
  pageNum: number;
  isCurrent: boolean;
  onTextCommit: (sceneId: string, actionId: string, text: string) => void;
  onMove: (sceneId: string, actionIndex: number, direction: 'up' | 'down') => void;
  onDeleteRequest: (sceneId: string, actionId: string) => void;
  onAddParagraph: (sceneId: string) => void;
}) {
  const { t } = useI18n();
  const actions = scene.actions ?? [];
  const noteActions = actions.filter((a) => NOTE_ACTION_TYPES.has(a.type));
  const hasSpeech = noteActions.some((a) => a.type === 'speech');
  const pageLabel = t('chat.lectureNotes.pageLabel', { n: pageNum });

  return (
    <div
      data-scene-id={scene.id}
      className={cn(
        'relative mb-3 last:mb-0 rounded-lg px-3 py-2.5 transition-colors duration-200',
        isCurrent
          ? 'bg-purple-50/80 dark:bg-purple-950/25 ring-1 ring-purple-200/60 dark:ring-purple-700/30'
          : 'bg-gray-50/50 dark:bg-gray-800/30',
      )}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <div
          className={cn(
            'h-2 w-2 shrink-0 rounded-full',
            isCurrent
              ? 'bg-purple-500 shadow-sm shadow-purple-400/40 dark:bg-purple-400'
              : 'bg-gray-300 dark:bg-gray-600',
          )}
        />
        <span
          className={cn(
            'text-[10px] font-semibold tracking-wide',
            isCurrent
              ? 'text-purple-600 dark:text-purple-400'
              : 'text-gray-400 dark:text-gray-500',
          )}
        >
          {pageLabel}
        </span>
        {isCurrent && (
          <span className="rounded-full bg-purple-100 px-1.5 py-px text-[9px] font-bold text-purple-600 dark:bg-purple-900/40 dark:text-purple-300">
            {t('chat.lectureNotes.currentPage')}
          </span>
        )}
      </div>

      <h4 className="mb-2 pl-4 text-[13px] font-bold leading-snug text-gray-800 dark:text-gray-100">
        {scene.title}
      </h4>

      <div className="space-y-1.5 pl-4">
        {noteActions.length === 0 && (
          <p className="text-[11px] text-muted-foreground">{t('chat.lectureNotes.noNarrationYet')}</p>
        )}

        {actions.map((action, actionIndex) => {
          if (action.type === 'speech') {
            return (
              <EditableSpeechRow
                key={`${action.id}:${action.text}`}
                sceneId={scene.id}
                action={action}
                actionIndex={actionIndex}
                actionCount={actions.length}
                onTextCommit={onTextCommit}
                onMove={onMove}
                onDeleteRequest={onDeleteRequest}
              />
            );
          }

          if (action.type === 'discussion') {
            const discussion = action as DiscussionAction;
            return (
              <div
                key={action.id}
                className="my-1 flex items-start gap-1.5 rounded-md border border-amber-200/60 bg-amber-50/60 px-2 py-1.5 dark:border-amber-700/30 dark:bg-amber-900/10"
              >
                <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 text-amber-500 dark:text-amber-400" />
                <span className="text-[11px] leading-snug text-amber-800 dark:text-amber-300">
                  {discussion.topic}
                </span>
              </div>
            );
          }

          if (action.type === 'spotlight' || action.type === 'laser' || action.type === 'play_video') {
            return (
              <div key={action.id} className="flex items-center gap-1 py-0.5">
                <ActionBadge type={action.type} />
              </div>
            );
          }

          return null;
        })}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-1 h-7 w-full text-[11px]"
          onClick={() => onAddParagraph(scene.id)}
        >
          <Plus className="mr-1 h-3 w-3" />
          {t('chat.lectureNotes.addParagraph')}
        </Button>

        {!hasSpeech && noteActions.length > 0 && (
          <p className="text-[10px] text-muted-foreground">{t('chat.lectureNotes.editSpeech')}</p>
        )}
      </div>
    </div>
  );
}

export function LectureNotesView({
  notes,
  currentSceneId,
  editable = false,
}: LectureNotesViewProps) {
  if (!editable) {
    return <ReadonlyLectureNotesView notes={notes} currentSceneId={currentSceneId} />;
  }

  return <EditableLectureNotesView currentSceneId={currentSceneId} />;
}

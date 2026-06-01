/**
 * @extends-from components/course-editor/course-editor/scene-list-editor.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { useState, useRef, useCallback } from 'react';
import { Copy, Plus, Trash2, PanelLeftClose } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useStageStore } from '@/lib/store/stage';
import { useSettingsStore } from '@/lib/store/settings';
import type { Scene } from '@/lib/types/stage';
import {
  duplicateScene,
  moveScene,
  normalizeSceneOrder,
} from '@/lib/course-editor/scene-operations';
import { cn } from '@/lib/utils';

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
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

const DEFAULT_WIDTH = 220;
const MIN_WIDTH = 170;
const MAX_WIDTH = 400;

export function SceneListEditor() {
  const { t } = useI18n();
  const stage = useStageStore.use.stage();
  const scenes = useStageStore.use.scenes();
  const currentSceneId = useStageStore.use.currentSceneId();
  const setScenes = useStageStore.use.setScenes();
  const updateScene = useStageStore.use.updateScene();
  const deleteScene = useStageStore.use.deleteScene();
  const setCurrentSceneId = useStageStore.use.setCurrentSceneId();

  const collapsed = useSettingsStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useSettingsStore((s) => s.setSidebarCollapsed);

  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
  const isDraggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

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
  const displayWidth = collapsed ? 0 : sidebarWidth;

  return (
    <div
      style={{
        width: displayWidth,
        transition: isDragging ? 'none' : 'width 0.3s ease',
      }}
      className="h-full bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-r border-gray-100 dark:border-gray-800 shadow-[2px_0_24px_rgba(0,0,0,0.02)] flex flex-col shrink-0 z-20 relative overflow-visible"
    >
      {!collapsed && (
        <div
          onMouseDown={handleDragStart}
          className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize z-50 group hover:bg-purple-400/30 dark:hover:bg-purple-600/30 active:bg-purple-500/40 dark:active:bg-purple-500/40 transition-colors"
        >
          <div className="absolute right-0.5 top-1/2 -translate-y-1/2 w-0.5 h-8 rounded-full bg-gray-300 dark:bg-gray-600 group-hover:bg-purple-400 dark:group-hover:bg-purple-500 transition-colors" />
        </div>
      )}

      <div className={cn('flex flex-col w-full h-full overflow-hidden', collapsed && 'hidden')}>
        <div className="h-10 flex items-center justify-between shrink-0 relative mt-3 mb-1 px-3 gap-2">
          <div className="min-w-0">
            <h2 className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">
              {t('courseEditor.structure')}
            </h2>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight truncate">
              {t('courseEditor.structureHint')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSidebarCollapsed(true)}
            className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center bg-gray-100/80 dark:bg-gray-800/80 text-gray-500 dark:text-gray-400 ring-1 ring-black/[0.04] dark:ring-white/[0.06] hover:bg-gray-200/90 dark:hover:bg-gray-700/90 hover:text-gray-700 dark:hover:text-gray-200 active:scale-90 transition-all duration-200"
            title={t('courseEditor.collapseStructurePanel')}
            aria-label={t('courseEditor.collapseStructurePanel')}
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        <div className="px-3 pb-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            disabled={!stage}
            onClick={() => {
              if (!stage) return;
              const nextScenes = normalizeSceneOrder([
                ...scenes,
                createQuizScene(
                  stage.id,
                  scenes.length,
                  t('courseEditor.defaultQuizTitle', { n: scenes.length + 1 }),
                ),
              ]);
              setScenes(nextScenes);
              setCurrentSceneId(nextScenes[nextScenes.length - 1]?.id ?? null);
            }}
          >
            <Plus className="size-4" />
            {t('courseEditor.addQuiz')}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-2 scrollbar-hide pt-1">
          {sortedScenes.map((scene, index) => (
            <div
              key={scene.id}
              className={cn(
                'rounded-lg border p-2',
                currentSceneId === scene.id
                  ? 'border-purple-200 dark:border-purple-700 bg-purple-50/80 dark:bg-purple-900/20'
                  : 'bg-card border-gray-100 dark:border-gray-800',
              )}
            >
              <button
                type="button"
                className="mb-2 w-full text-left text-xs text-muted-foreground"
                onClick={() => setCurrentSceneId(scene.id)}
              >
                {index + 1}. {scene.type}
              </button>
              <Input
                value={scene.title}
                aria-label={t('courseEditor.sceneTitle')}
                onFocus={() => setCurrentSceneId(scene.id)}
                onChange={(event) => updateScene(scene.id, { title: event.target.value })}
              />
              <div className="mt-2 flex gap-1 flex-wrap">
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
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={t('courseEditor.deleteScene')}
                  onClick={() => deleteScene(scene.id)}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

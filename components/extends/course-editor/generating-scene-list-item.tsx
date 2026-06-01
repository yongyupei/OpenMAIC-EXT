'use client';

import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { SceneOutline } from '@/lib/types/generation';

interface GeneratingSceneListItemProps {
  readonly outline: SceneOutline;
  readonly sceneIndex: number;
  readonly isActive: boolean;
  readonly isFailed?: boolean;
  readonly onSelect: () => void;
}

export function GeneratingSceneListItem({
  outline,
  sceneIndex,
  isActive,
  isFailed = false,
  onSelect,
}: GeneratingSceneListItemProps) {
  const { t } = useI18n();

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={isFailed}
      className={cn(
        'relative w-full overflow-hidden rounded-lg border p-2 text-left transition-all',
        isFailed
          ? 'cursor-default border-red-200 bg-red-50/70 dark:border-red-900/50 dark:bg-red-950/20'
          : 'cursor-pointer border-dashed border-purple-200/80 bg-purple-50/40 hover:bg-purple-50/70 dark:border-purple-800/60 dark:bg-purple-950/20 dark:hover:bg-purple-950/30',
        isActive &&
          !isFailed &&
          'border-purple-300 bg-purple-50/90 ring-1 ring-purple-200 dark:border-purple-700 dark:bg-purple-900/30 dark:ring-purple-800',
        !isActive && !isFailed && 'opacity-80',
      )}
    >
      <p className="mb-1 text-xs text-muted-foreground">
        {sceneIndex + 1}. {outline.type}
      </p>
      <p className="truncate text-xs font-medium text-foreground">{outline.title}</p>
      <div className="relative mt-2 space-y-1.5 overflow-hidden rounded-md border border-purple-100/80 bg-white/70 p-2 dark:border-purple-900/40 dark:bg-slate-900/50">
        <div
          className={cn(
            'h-2 w-3/5 rounded bg-gray-200 dark:bg-gray-700',
            !isFailed && 'animate-pulse',
          )}
        />
        <div
          className={cn(
            'h-1.5 w-2/5 rounded bg-gray-200 dark:bg-gray-700',
            !isFailed && 'animate-pulse',
          )}
        />
        <span
          className={cn(
            'mt-0.5 block text-[10px] font-medium',
            isFailed ? 'text-red-500 dark:text-red-400' : 'text-purple-500 dark:text-purple-300',
          )}
        >
          {isFailed ? t('stage.generationFailed') : t('stage.generating')}
        </span>
        {!isFailed ? (
          <div className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent dark:via-white/10" />
        ) : null}
      </div>
    </button>
  );
}

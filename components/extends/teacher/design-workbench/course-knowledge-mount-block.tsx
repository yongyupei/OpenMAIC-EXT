/**
 * @extends-from components/teacher/design-workbench/course-knowledge-mount-block.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { KnowledgePicker } from '@/components/knowledge-base/knowledge-picker';
import { patchProjectKnowledgeMount } from '@/lib/knowledge-base/client';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

export interface CourseKnowledgeMountBlockProps {
  readonly projectId: string;
  readonly selectedNodeIds: string[];
  readonly onUpdated: (nodeIds: string[]) => void;
  readonly disabled?: boolean;
  readonly highlighted?: boolean;
  readonly className?: string;
}

export function CourseKnowledgeMountBlock({
  projectId,
  selectedNodeIds,
  onUpdated,
  disabled,
  highlighted,
  className,
}: CourseKnowledgeMountBlockProps) {
  const { t } = useI18n();
  const [saving, setSaving] = useState(false);

  const handleChange = useCallback(
    async (nodeIds: string[]) => {
      setSaving(true);
      try {
        await patchProjectKnowledgeMount(projectId, nodeIds);
        onUpdated(nodeIds);
        toast.success(t('knowledgeBase.courseMount.saved'));
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t('knowledgeBase.courseMount.saveFailed'),
        );
      } finally {
        setSaving(false);
      }
    },
    [onUpdated, projectId, t],
  );

  return (
    <div
      className={cn(
        'flex h-full min-w-0 flex-col rounded-xl border border-slate-200/70 bg-white/90 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/80',
        highlighted &&
          'ring-2 ring-violet-400/80 ring-offset-2 ring-offset-white dark:ring-offset-slate-950',
        className,
      )}
    >
      <h3 className="text-sm font-medium">{t('knowledgeBase.courseMount.title')}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{t('knowledgeBase.courseMount.hint')}</p>
      <div className="mt-2">
        <KnowledgePicker
          selectedNodeIds={selectedNodeIds}
          onChange={(ids) => void handleChange(ids)}
          disabled={disabled || saving}
        />
      </div>
    </div>
  );
}

/**
 * @extends-from components/teacher/course-publish-button.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { CourseChapterClassroomStatus, CourseProject } from '@/lib/teacher/course-types';

interface CoursePublishButtonProps {
  readonly project: CourseProject;
  /** Live statuses from polling, overrides project.chapterClassrooms counts */
  readonly liveChapterStatuses?: Record<string, CourseChapterClassroomStatus>;
  readonly onPublishSuccess?: (classroomId: string) => void;
}

export function CoursePublishButton({
  project,
  liveChapterStatuses,
  onPublishSuccess,
}: CoursePublishButtonProps) {
  const { t } = useI18n();
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalChapters = project.outline?.chapters.length ?? 0;

  // Prefer live polling statuses over stale server-rendered project data
  const publishedCount = liveChapterStatuses
    ? Object.values(liveChapterStatuses).filter((s) => s === 'published').length
    : Object.values(project.chapterClassrooms ?? {}).filter((cc) => cc.status === 'published')
        .length;

  const canPublish = publishedCount > 0 && !publishing;

  const handlePublish = async () => {
    if (!canPublish) return;
    setPublishing(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/extends/teacher/projects/${encodeURIComponent(project.id)}/publish`,
        { method: 'POST' },
      );
      const json = (await response.json().catch(() => ({}))) as {
        data?: { classroomId?: string };
        error?: string;
      };
      if (!response.ok) {
        throw new Error(json.error ?? `HTTP ${response.status}`);
      }
      if (json.data?.classroomId) {
        onPublishSuccess?.(json.data.classroomId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {t('teacher.publishCourse.progress', {
            count: String(publishedCount),
            total: String(totalChapters),
          })}
        </span>
        <Button type="button" size="sm" disabled={!canPublish} onClick={() => void handlePublish()}>
          {publishing ? '…' : t('teacher.publishCourse.button')}
        </Button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

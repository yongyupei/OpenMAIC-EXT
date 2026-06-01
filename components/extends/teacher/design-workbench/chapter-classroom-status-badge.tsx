/**
 * @extends-from components/teacher/design-workbench/chapter-classroom-status-badge.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import type { LucideIcon } from 'lucide-react';
import { BookOpen, CheckCircle, Clock, Loader2, XCircle } from 'lucide-react';

import { useI18n } from '@/lib/hooks/use-i18n';
import type { CourseChapterClassroomStatus } from '@/lib/teacher/course-types';
import { cn } from '@/lib/utils';

interface ChapterClassroomStatusBadgeProps {
  readonly status: CourseChapterClassroomStatus;
  readonly className?: string;
}

const STATUS_CONFIG: Record<
  CourseChapterClassroomStatus,
  {
    Icon: LucideIcon;
    colorClass: string;
    labelKey: string;
  }
> = {
  generating: {
    Icon: Loader2,
    colorClass: 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/40',
    labelKey: 'teacher.chapter.status.generating',
  },
  'awaiting-outline-approval': {
    Icon: Clock,
    colorClass: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/40',
    labelKey: 'teacher.chapter.status.awaitingOutlineApproval',
  },
  ready: {
    Icon: CheckCircle,
    colorClass: 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40',
    labelKey: 'teacher.chapter.status.ready',
  },
  published: {
    Icon: BookOpen,
    colorClass: 'text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-950/40',
    labelKey: 'teacher.chapter.status.published',
  },
  failed: {
    Icon: XCircle,
    colorClass: 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/40',
    labelKey: 'teacher.chapter.status.failed',
  },
};

export function ChapterClassroomStatusBadge({
  status,
  className,
}: ChapterClassroomStatusBadgeProps) {
  const { t } = useI18n();
  const { Icon, colorClass, labelKey } = STATUS_CONFIG[status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        colorClass,
        className,
      )}
    >
      <Icon
        className={cn('h-3 w-3', status === 'generating' && 'animate-spin')}
        aria-hidden="true"
      />
      {t(labelKey)}
    </span>
  );
}

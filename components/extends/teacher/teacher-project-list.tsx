/**
 * @extends-from components/teacher/teacher-project-list.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { ArrowLeft, BookOpen, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useNavigateBack } from '@/lib/hooks/use-navigate-back';
import type { CourseProjectStatus } from '@/lib/teacher/course-types';
import type { TeacherProjectListItem } from '@/lib/teacher/project-list-summary';
import { buildTeacherDesignPath, buildTeacherNewPath } from '@/lib/teacher/routes';
import { deleteTeacherProject } from '@/lib/teacher/teacher-projects-client';
import { cn } from '@/lib/utils';

function statusLabelKey(status: CourseProjectStatus): string {
  switch (status) {
    case 'generating':
      return 'teacher.projects.status.generating';
    case 'editing':
      return 'teacher.projects.status.editing';
    case 'published':
      return 'teacher.projects.status.published';
    case 'outlining':
      return 'teacher.projects.status.outlining';
    default:
      return 'teacher.projects.status.draft';
  }
}

function formatUpdatedAt(iso: string, t: (key: string) => string): string {
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return '';
  const diffDays = Math.floor((Date.now() - time) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return t('classroom.today');
  if (diffDays === 1) return t('classroom.yesterday');
  if (diffDays < 7) return `${diffDays} ${t('classroom.daysAgo')}`;
  return new Date(iso).toLocaleDateString();
}

interface TeacherProjectListProps {
  readonly projects: readonly TeacherProjectListItem[];
  readonly showHeader?: boolean;
  readonly compact?: boolean;
  readonly onProjectDeleted?: (projectId: string) => void;
}

export function TeacherProjectList({
  projects,
  showHeader = true,
  compact = false,
  onProjectDeleted,
}: TeacherProjectListProps) {
  const { t } = useI18n();
  const navigateBack = useNavigateBack('/');

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-slate-200/80 bg-white/60 px-6 py-12 text-center dark:border-slate-800 dark:bg-slate-900/40">
        <BookOpen className="size-10 text-violet-500/70" />
        <div className="space-y-1">
          <p className="text-base font-semibold text-foreground">
            {t('teacher.projects.emptyTitle')}
          </p>
          <p className="text-sm text-muted-foreground">{t('teacher.projects.emptyDescription')}</p>
        </div>
        <Button asChild>
          <Link href={buildTeacherNewPath()}>{t('teacher.projects.newCourse')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', compact && 'space-y-3')}>
      {showHeader ? (
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={navigateBack}
              aria-label={t('teacher.projects.back')}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                {t('teacher.projects.pageTitle')}
              </h1>
              <p className="text-sm text-muted-foreground">{t('teacher.projects.pageSubtitle')}</p>
            </div>
          </div>
          <Button asChild size="sm">
            <Link href={buildTeacherNewPath()}>{t('teacher.projects.newCourse')}</Link>
          </Button>
        </header>
      ) : null}
      <ul className={cn('space-y-2', compact && 'space-y-1.5')}>
        {projects.map((project) => (
          <li key={project.id}>
            <TeacherProjectRow
              project={project}
              compact={compact}
              t={t}
              onProjectDeleted={onProjectDeleted}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function TeacherProjectRow({
  project,
  compact,
  t,
  onProjectDeleted,
}: {
  project: TeacherProjectListItem;
  compact: boolean;
  t: (key: string, options?: Record<string, string>) => string;
  onProjectDeleted?: (projectId: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const title = project.title.trim() || t('teacher.projects.untitled');
  const designHref = buildTeacherDesignPath(project.id);

  const handleDelete = useCallback(async () => {
    if (deleting) return;
    const confirmed = window.confirm(t('teacher.projects.deleteConfirm', { title }));
    if (!confirmed) return;

    setDeleting(true);
    try {
      await deleteTeacherProject(project.id);
      onProjectDeleted?.(project.id);
    } catch {
      window.alert(t('teacher.projects.deleteFailed'));
    } finally {
      setDeleting(false);
    }
  }, [deleting, onProjectDeleted, project.id, t, title]);

  return (
    <article
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-white/85 px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/85',
        compact && 'px-3 py-2.5',
      )}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate font-medium text-foreground">{title}</p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full bg-violet-500/10 px-2 py-0.5 font-medium text-violet-700 dark:text-violet-300">
            {t(statusLabelKey(project.status))}
          </span>
          <span>{formatUpdatedAt(project.updatedAt, t)}</span>
          {project.hasDesignChat ? (
            <span className="text-violet-600/80 dark:text-violet-400/80">
              {t('teacher.projects.hasChat')}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 text-destructive hover:text-destructive"
          disabled={deleting}
          onClick={() => void handleDelete()}
          aria-label={t('teacher.projects.delete')}
        >
          <Trash2 className="size-3.5" />
          {compact ? (
            <span className="sr-only">{t('teacher.projects.delete')}</span>
          ) : (
            t('teacher.projects.delete')
          )}
        </Button>
        <Button asChild size="sm" disabled={deleting}>
          <Link href={designHref}>{t('teacher.projects.continueDesign')}</Link>
        </Button>
      </div>
    </article>
  );
}

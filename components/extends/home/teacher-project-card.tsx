/**
 * @extends-from components/home/teacher-project-card.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import Link from 'next/link';
import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { BookOpen, ExternalLink, Layers, LayoutDashboard, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { CourseProjectStatus } from '@/lib/teacher/course-types';
import type { TeacherProjectListItem } from '@/lib/teacher/project-list-summary';
import { buildTeacherDesignPath } from '@/lib/teacher/routes';
import { deleteTeacherProject } from '@/lib/teacher/teacher-projects-client';
import { cn } from '@/lib/utils';

function statusColors(status: CourseProjectStatus) {
  switch (status) {
    case 'published':
      return {
        from: 'from-emerald-400/80',
        to: 'to-teal-500/80',
        badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
        icon: 'text-emerald-300/80',
      };
    case 'editing':
      return {
        from: 'from-violet-400/80',
        to: 'to-purple-500/80',
        badge: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
        icon: 'text-violet-300/80',
      };
    case 'generating':
    case 'outlining':
      return {
        from: 'from-amber-400/80',
        to: 'to-orange-500/80',
        badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
        icon: 'text-amber-300/80',
      };
    default:
      return {
        from: 'from-slate-400/70',
        to: 'to-slate-500/70',
        badge: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
        icon: 'text-slate-300/80',
      };
  }
}

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

interface TeacherProjectCardProps {
  readonly project: TeacherProjectListItem;
  readonly onDeleted?: (projectId: string) => void;
}

export function TeacherProjectCard({ project, onDeleted }: TeacherProjectCardProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const colors = statusColors(project.status);
  const title = project.title.trim() || t('teacher.projects.untitled');
  const designHref = buildTeacherDesignPath(project.id);

  const handleCardClick = () => {
    if (!confirmingDelete) router.push(designHref);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmingDelete(true);
  };

  const handleConfirmDelete = useCallback(async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteTeacherProject(project.id);
      onDeleted?.(project.id);
    } catch {
      setConfirmingDelete(false);
    } finally {
      setDeleting(false);
    }
  }, [deleting, onDeleted, project.id]);

  return (
    <div className="group cursor-pointer" onClick={handleCardClick}>
      {/* ── Cover area ── */}
      <div
        className={cn(
          'relative w-full aspect-[16/9] rounded-2xl overflow-hidden transition-transform duration-200 group-hover:scale-[1.02]',
          `bg-gradient-to-br ${colors.from} ${colors.to}`,
        )}
      >
        {/* Decorative background blobs */}
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute -top-4 -right-4 size-32 rounded-full bg-white/30 blur-2xl" />
          <div className="absolute -bottom-6 -left-4 size-24 rounded-full bg-black/20 blur-2xl" />
        </div>

        {/* Center icon */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <BookOpen className={cn('size-10 drop-shadow-sm', colors.icon)} strokeWidth={1.5} />
        </div>

        {/* Chapter count badge — top left */}
        {(project.chapterCount ?? 0) > 0 && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/25 backdrop-blur-sm px-2 py-0.5 text-[11px] font-medium text-white/90 pointer-events-none">
            <Layers className="size-2.5" />
            {project.chapterCount} {t('teacher.projects.chapterCount')}
          </span>
        )}

        {/* Published classroom link — visible on hover, top right area */}
        {project.publishedClassroomId && (
          <Link
            href={`/classroom/${project.publishedClassroomId}`}
            onClick={(e) => e.stopPropagation()}
            className="absolute top-2 right-11 size-7 flex items-center justify-center rounded-full bg-black/30 hover:bg-emerald-600/80 text-white backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity z-10"
            title={t('teacher.projects.viewPublished')}
          >
            <ExternalLink className="size-3.5" />
          </Link>
        )}

        {/* Delete button — visible on hover */}
        <AnimatePresence>
          {!confirmingDelete && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Button
                size="icon"
                variant="ghost"
                className="absolute top-2 right-2 size-7 opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 hover:bg-destructive/80 text-white hover:text-white backdrop-blur-sm rounded-full z-10"
                onClick={handleDeleteClick}
                aria-label={t('teacher.projects.delete')}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Delete confirm overlay */}
        <AnimatePresence>
          {confirmingDelete && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/50 backdrop-blur-[6px]"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-[13px] font-medium text-white/90">
                {t('classroom.deleteConfirmTitle')}?
              </span>
              <div className="flex gap-2">
                <button
                  className="px-3.5 py-1 rounded-lg text-[12px] font-medium bg-white/15 text-white/80 hover:bg-white/25 backdrop-blur-sm transition-colors"
                  onClick={() => setConfirmingDelete(false)}
                >
                  {t('common.cancel')}
                </button>
                <button
                  disabled={deleting}
                  className="px-3.5 py-1 rounded-lg text-[12px] font-medium bg-red-500/90 text-white hover:bg-red-500 transition-colors disabled:opacity-60"
                  onClick={() => void handleConfirmDelete()}
                >
                  {t('classroom.delete')}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom gradient for text readability */}
        <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />

        {/* Status badge — bottom left */}
        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-black/20 backdrop-blur-sm text-white/90 pointer-events-none">
          <LayoutDashboard className="size-2.5" />
          {t(statusLabelKey(project.status))}
        </span>
      </div>

      {/* ── Metadata row ── */}
      <div className="mt-2.5 px-1 flex items-center gap-2">
        <span className="shrink-0 inline-flex items-center rounded-full bg-violet-100 dark:bg-violet-900/30 px-2 py-0.5 text-[11px] font-medium text-violet-600 dark:text-violet-400">
          {formatUpdatedAt(project.updatedAt, t)}
        </span>
        <p className="font-medium text-[15px] truncate text-foreground/90 min-w-0">{title}</p>
      </div>
    </div>
  );
}

/** Card grid for the homepage recent courses tab */
export function TeacherProjectCardGrid({
  projects,
  onDeleted,
}: {
  readonly projects: readonly TeacherProjectListItem[];
  readonly onDeleted?: (projectId: string) => void;
}) {
  return (
    <div className="pt-2 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-8">
      {projects.map((project, i) => (
        <motion.div
          key={project.id}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04, duration: 0.35, ease: 'easeOut' }}
        >
          <TeacherProjectCard project={project} onDeleted={onDeleted} />
        </motion.div>
      ))}
    </div>
  );
}

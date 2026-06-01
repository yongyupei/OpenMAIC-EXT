/**
 * @extends-from app/teacher/projects/page.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, Plus } from 'lucide-react';
import { motion } from 'motion/react';

import { Button } from '@/components/ui/button';
import { TeacherProjectCard } from '@/components/home/teacher-project-card';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useNavigateBack } from '@/lib/hooks/use-navigate-back';
import type { TeacherProjectListItem } from '@/lib/teacher/project-list-summary';
import { listTeacherProjects } from '@/lib/teacher/teacher-projects-client';
import { buildTeacherNewPath } from '@/lib/teacher/routes';

export default function TeacherProjectsPage() {
  const { t } = useI18n();
  const navigateBack = useNavigateBack('/');
  const [projects, setProjects] = useState<TeacherProjectListItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const items = await listTeacherProjects();
        if (active) {
          setProjects(items);
          setLoadError(false);
        }
      } catch {
        if (active) {
          setProjects([]);
          setLoadError(true);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleDeleted = (projectId: string) => {
    setProjects((items) => items?.filter((item) => item.id !== projectId) ?? null);
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50 px-6 py-10 text-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-purple-950 dark:text-slate-50">
      <div className="mx-auto max-w-6xl space-y-8">
        {/* ── Header ── */}
        <header className="flex flex-wrap items-center justify-between gap-4">
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
              <h1 className="text-2xl font-bold tracking-tight">
                {t('teacher.projects.pageTitle')}
              </h1>
              <p className="text-sm text-muted-foreground">{t('teacher.projects.pageSubtitle')}</p>
            </div>
          </div>
          <Button asChild>
            <Link href={buildTeacherNewPath()} className="gap-1.5">
              <Plus className="size-4" />
              {t('teacher.projects.newCourse')}
            </Link>
          </Button>
        </header>

        {/* ── Error ── */}
        {loadError && (
          <p className="text-sm text-destructive" role="alert">
            {t('teacher.projects.loadError')}
          </p>
        )}

        {/* ── Content ── */}
        {projects === null ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-8">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-800/60 aspect-[16/9]"
              />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-slate-200/80 bg-white/60 px-6 py-16 text-center dark:border-slate-800 dark:bg-slate-900/40">
            <BookOpen className="size-12 text-violet-500/70" />
            <div className="space-y-1">
              <p className="text-base font-semibold text-foreground">
                {t('teacher.projects.emptyTitle')}
              </p>
              <p className="text-sm text-muted-foreground">
                {t('teacher.projects.emptyDescription')}
              </p>
            </div>
            <Button asChild>
              <Link href={buildTeacherNewPath()}>{t('teacher.projects.newCourse')}</Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-8">
            {projects.map((project, i) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.35, ease: 'easeOut' }}
              >
                <TeacherProjectCard project={project} onDeleted={handleDeleted} />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

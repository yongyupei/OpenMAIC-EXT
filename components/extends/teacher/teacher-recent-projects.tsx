/**
 * @extends-from components/teacher/teacher-recent-projects.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

import { TeacherProjectList } from '@/components/teacher/teacher-project-list';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { TeacherProjectListItem } from '@/lib/teacher/project-list-summary';
import { buildTeacherProjectsPath } from '@/lib/teacher/routes';
import { listTeacherProjects } from '@/lib/teacher/teacher-projects-client';
import { cn } from '@/lib/utils';

const RECENT_LIMIT = 5;

export function TeacherRecentProjects({ className }: { readonly className?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(true);
  const [projects, setProjects] = useState<TeacherProjectListItem[] | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const items = await listTeacherProjects();
        if (active) setProjects(items.slice(0, RECENT_LIMIT));
      } catch {
        if (active) setProjects([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (projects === null || projects.length === 0) {
    return null;
  }

  return (
    <section className={cn('w-full max-w-[800px]', className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="mb-2 flex w-full items-center justify-between gap-2 text-left text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <span>{t('teacher.projects.recentTitle')}</span>
        {open ? (
          <ChevronUp className="size-4 shrink-0" />
        ) : (
          <ChevronDown className="size-4 shrink-0" />
        )}
      </button>
      {open ? (
        <div className="space-y-2">
          <TeacherProjectList
            projects={projects}
            showHeader={false}
            compact
            onProjectDeleted={(projectId) =>
              setProjects((items) => items?.filter((item) => item.id !== projectId) ?? null)
            }
          />
          <p className="text-center text-xs">
            <Link
              href={buildTeacherProjectsPath()}
              className="text-violet-600 hover:underline dark:text-violet-400"
            >
              {t('teacher.projects.viewAll')}
            </Link>
          </p>
        </div>
      ) : null}
    </section>
  );
}

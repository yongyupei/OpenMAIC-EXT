/**
 * @extends-from components/course-editor/course-chapter-nav-bar.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

export interface CourseChapterNavChapter {
  readonly id: string;
  readonly title: string;
}

interface CourseChapterNavBarProps {
  readonly chapters: readonly CourseChapterNavChapter[];
  readonly activeChapterId: string | null;
  readonly onSelectChapter: (chapterId: string) => void;
  /** `sidebar`: vertical list for the left panel; default matches the old top toolbar row. */
  readonly variant?: 'toolbar' | 'sidebar';
}

export function CourseChapterNavBar({
  chapters,
  activeChapterId,
  onSelectChapter,
  variant = 'toolbar',
}: CourseChapterNavBarProps) {
  const { t } = useI18n();

  if (chapters.length === 0) return null;

  const isSidebar = variant === 'sidebar';

  const chipClass = (active: boolean) =>
    cn(
      'border text-xs font-medium transition-colors',
      isSidebar ? 'w-full rounded-lg px-2.5 py-1.5 text-left' : 'shrink-0 rounded-full px-3 py-1',
      active
        ? 'border-violet-500 bg-violet-600 text-white shadow-sm dark:border-violet-400 dark:bg-violet-500'
        : 'border-transparent bg-background/80 text-muted-foreground hover:border-border hover:text-foreground',
    );

  return (
    <div
      className={cn(
        'border-border/60 bg-muted/30',
        isSidebar
          ? 'flex h-full min-h-0 flex-1 flex-col gap-2 border-b px-2 py-2'
          : 'flex shrink-0 items-center gap-2 border-b px-3 py-2',
      )}
      role="navigation"
      aria-label={t('courseEditor.chapterNav.ariaLabel')}
    >
      <span
        className={cn(
          'shrink-0 text-xs font-medium text-muted-foreground',
          isSidebar ? 'px-1' : 'hidden sm:inline',
        )}
      >
        {t('courseEditor.chapterNav.label')}
      </span>
      <div
        className={cn(
          'flex min-w-0 gap-1.5',
          isSidebar
            ? 'min-h-0 flex-1 flex-col overflow-y-auto pb-0.5'
            : 'flex-1 overflow-x-auto pb-0.5',
        )}
      >
        {chapters.map((chapter) => {
          const active = chapter.id === activeChapterId;
          return (
            <button
              key={chapter.id}
              type="button"
              onClick={() => onSelectChapter(chapter.id)}
              className={chipClass(active)}
            >
              <span className={cn('truncate', isSidebar ? 'block w-full' : 'max-w-[10rem]')}>
                {chapter.title.trim() || chapter.id}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

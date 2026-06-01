/**
 * @extends-from components/home/home-recent-tabs.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Search, Upload, X } from 'lucide-react';

import { ClassroomCard } from '@/components/home/classroom-card';
import { TeacherProjectCardGrid } from '@/components/home/teacher-project-card';
import { InputGroup, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { Slide } from '@/lib/types/slides';
import type { TeacherProjectListItem } from '@/lib/teacher/project-list-summary';
import { buildTeacherProjectsPath } from '@/lib/teacher/routes';
import { listTeacherProjects } from '@/lib/teacher/teacher-projects-client';
import type { StageListItem } from '@/lib/utils/stage-storage';
import { cn } from '@/lib/utils';

const RECENT_TAB_STORAGE_KEY = 'homeRecentTab';
const RECENT_LIMIT = 5;

export type HomeRecentTab = 'courses' | 'learning';

interface HomeRecentTabsProps {
  readonly classrooms: readonly StageListItem[];
  readonly filteredClassrooms: readonly StageListItem[];
  readonly thumbnails: Readonly<Record<string, Slide>>;
  readonly searchQuery: string;
  readonly searchOpen: boolean;
  readonly onSearchQueryChange: (query: string) => void;
  readonly onSearchOpenChange: (open: boolean) => void;
  readonly pendingDeleteId: string | null;
  readonly onDelete: (id: string, e: React.MouseEvent) => void;
  readonly onConfirmDelete: (id: string) => void;
  readonly onCancelDelete: () => void;
  readonly onRename: (id: string, newName: string) => void;
  readonly formatDate: (timestamp: number) => string;
  readonly onImportClick: () => void;
  readonly importing: boolean;
  readonly defaultTab?: HomeRecentTab;
}

export function HomeRecentTabs({
  classrooms,
  filteredClassrooms,
  thumbnails,
  searchQuery,
  searchOpen,
  onSearchQueryChange,
  onSearchOpenChange,
  pendingDeleteId,
  onDelete,
  onConfirmDelete,
  onCancelDelete,
  onRename,
  formatDate,
  onImportClick,
  importing,
  defaultTab = 'learning',
}: HomeRecentTabsProps) {
  const { t } = useI18n();
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);

  const [projects, setProjects] = useState<TeacherProjectListItem[] | null>(null);
  const [activeTab, setActiveTab] = useState<HomeRecentTab>(defaultTab);
  const [recentOpen, setRecentOpen] = useState(true);

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

  /* eslint-disable react-hooks/set-state-in-effect -- Hydrate tab/open state from localStorage on mount */
  useEffect(() => {
    try {
      const savedTab = localStorage.getItem(RECENT_TAB_STORAGE_KEY);
      if (savedTab === 'courses' || savedTab === 'learning') {
        setActiveTab(savedTab);
      }
      const savedOpen = localStorage.getItem('recentClassroomsOpen');
      if (savedOpen !== null) setRecentOpen(savedOpen !== 'false');
    } catch {
      /* ignore */
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const persistTab = (tab: HomeRecentTab) => {
    setActiveTab(tab);
    try {
      localStorage.setItem(RECENT_TAB_STORAGE_KEY, tab);
    } catch {
      /* ignore */
    }
  };

  const persistRecentOpen = (next: boolean) => {
    setRecentOpen(next);
    try {
      localStorage.setItem('recentClassroomsOpen', String(next));
    } catch {
      /* ignore */
    }
  };

  if (projects === null) return null;

  const courseCount = projects.length;
  const learningCount = classrooms.length;
  if (courseCount === 0 && learningCount === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.5 }}
      className="relative z-10 mt-10 w-full max-w-6xl flex flex-col items-center"
    >
      <div className="group w-full flex items-center gap-4 py-2">
        <div className="flex-1 h-px bg-border/40 group-hover:bg-border/70 transition-colors" />
        <div className="shrink-0 flex items-center gap-3 text-[13px] text-muted-foreground/60 select-none">
          <button
            type="button"
            onClick={() => persistRecentOpen(!recentOpen)}
            className="flex items-center gap-2 hover:text-foreground/70 transition-colors cursor-pointer"
          >
            <span>{t('home.recentSection')}</span>
            <motion.div
              animate={{ rotate: recentOpen ? 180 : 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
            >
              <ChevronDown className="size-3.5" />
            </motion.div>
          </button>
        </div>
        <div className="flex-1 h-px bg-border/40 group-hover:bg-border/70 transition-colors" />
      </div>

      <AnimatePresence>
        {recentOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
            className="w-full overflow-hidden"
          >
            <Tabs
              value={activeTab}
              onValueChange={(value) => persistTab(value as HomeRecentTab)}
              className="w-full gap-4 pt-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <TabsList variant="line" className="h-9 w-full sm:w-auto">
                  <TabsTrigger value="courses" className="gap-1.5 px-3 text-[13px]">
                    {t('teacher.projects.recentTitle')}
                    <span className="text-[11px] tabular-nums opacity-60">{courseCount}</span>
                  </TabsTrigger>
                  <TabsTrigger value="learning" className="gap-1.5 px-3 text-[13px]">
                    {t('classroom.recentClassrooms')}
                    <span className="text-[11px] tabular-nums opacity-60">{learningCount}</span>
                  </TabsTrigger>
                </TabsList>

                {activeTab === 'learning' ? (
                  <div className="flex items-center justify-end gap-2">
                    <AnimatePresence initial={false}>
                      {!searchOpen ? (
                        <motion.button
                          key="search-icon"
                          ref={searchButtonRef}
                          type="button"
                          aria-label={t('classroom.searchAriaLabel')}
                          onClick={() => {
                            onSearchOpenChange(true);
                            requestAnimationFrame(() => searchInputRef.current?.focus());
                          }}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.12, ease: 'easeOut' }}
                          className="flex items-center justify-center size-8 rounded-full text-muted-foreground/50 hover:text-foreground/70 hover:bg-muted/50 transition-colors cursor-pointer"
                        >
                          <Search className="size-3.5" />
                        </motion.button>
                      ) : (
                        <motion.div
                          key="search-input"
                          initial={{ opacity: 0, width: 0 }}
                          animate={{ opacity: 1, width: 200 }}
                          exit={{ opacity: 0, width: 0 }}
                          transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
                          className="overflow-hidden"
                        >
                          <InputGroup
                            className={cn(
                              'h-8 text-[12px] rounded-full bg-muted/40 border-transparent shadow-none',
                              'transition-colors hover:bg-muted/60',
                            )}
                          >
                            <InputGroupInput
                              ref={searchInputRef}
                              value={searchQuery}
                              onChange={(e) => onSearchQueryChange(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                  e.preventDefault();
                                  if (searchQuery) {
                                    onSearchQueryChange('');
                                  } else {
                                    onSearchOpenChange(false);
                                    requestAnimationFrame(() => searchButtonRef.current?.focus());
                                  }
                                }
                              }}
                              onBlur={() => {
                                if (!searchQuery) onSearchOpenChange(false);
                              }}
                              placeholder={t('classroom.searchPlaceholder')}
                              aria-label={t('classroom.searchAriaLabel')}
                              className="h-8 pl-3 placeholder:text-muted-foreground/50"
                            />
                            {searchQuery ? (
                              <InputGroupButton
                                size="icon-xs"
                                aria-label={t('classroom.clearSearch')}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  onSearchQueryChange('');
                                  searchInputRef.current?.focus();
                                }}
                              >
                                <X />
                              </InputGroupButton>
                            ) : null}
                          </InputGroup>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <button
                      type="button"
                      onClick={onImportClick}
                      disabled={importing}
                      className="group/import grid grid-cols-[auto_0fr] hover:grid-cols-[auto_1fr] items-center gap-1 rounded-full px-2 py-1 text-[12px] text-muted-foreground/50 hover:text-muted-foreground/80 hover:bg-muted/50 transition-all duration-200 cursor-pointer"
                    >
                      <Upload className="size-3" />
                      <span className="overflow-hidden opacity-0 group-hover/import:opacity-100 transition-opacity duration-200 whitespace-nowrap">
                        {t('import.classroom')}
                      </span>
                    </button>
                  </div>
                ) : null}
              </div>

              <TabsContent value="courses" className="mt-0 outline-none">
                {courseCount === 0 ? (
                  <p className="py-10 text-center text-[13px] text-muted-foreground/60">
                    {t('home.recentCoursesEmpty')}
                  </p>
                ) : (
                  <div className="space-y-4">
                    <TeacherProjectCardGrid
                      projects={projects}
                      onDeleted={(id) =>
                        setProjects((prev) => (prev ? prev.filter((p) => p.id !== id) : prev))
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
                )}
              </TabsContent>

              <TabsContent value="learning" className="mt-0 outline-none">
                {learningCount === 0 ? (
                  <p className="py-10 text-center text-[13px] text-muted-foreground/60">
                    {t('home.recentLearningEmpty')}
                  </p>
                ) : searchQuery.trim() && filteredClassrooms.length === 0 ? (
                  <div className="pt-8 pb-2 text-center text-[13px] text-muted-foreground/60">
                    {t('classroom.searchEmpty')}
                  </div>
                ) : (
                  <div className="pt-2 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-8">
                    {filteredClassrooms.map((classroom, i) => (
                      <motion.div
                        key={classroom.id}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          delay: i * 0.04,
                          duration: 0.35,
                          ease: 'easeOut',
                        }}
                      >
                        <ClassroomCard
                          classroom={classroom}
                          slide={thumbnails[classroom.id]}
                          formatDate={formatDate}
                          onDelete={onDelete}
                          onRename={onRename}
                          confirmingDelete={pendingDeleteId === classroom.id}
                          onConfirmDelete={() => onConfirmDelete(classroom.id)}
                          onCancelDelete={onCancelDelete}
                          onClick={() => router.push(`/classroom/${classroom.id}`)}
                        />
                      </motion.div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

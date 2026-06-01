/**
 * @extends-from components/teacher/identity-choice.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import type { ReactNode } from 'react';
import { Sparkles, GraduationCap } from 'lucide-react';

import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

export type IdentityMode = 'student' | 'teacher';

interface IdentityChoiceProps {
  readonly mode: IdentityMode;
  readonly onModeChange: (mode: IdentityMode) => void;
}

export function IdentityChoice({ mode, onModeChange }: IdentityChoiceProps) {
  const { t } = useI18n();

  return (
    <div
      role="radiogroup"
      aria-label={t('teacher.identity.groupLabel')}
      className="grid w-full gap-3 sm:grid-cols-2"
    >
      <ModeCard
        active={mode === 'student'}
        dataTestId="home-identity-student"
        icon={<Sparkles className="size-4" />}
        title={t('teacher.identity.studentTitle')}
        description={t('teacher.identity.studentDescription')}
        onSelect={() => onModeChange('student')}
      />
      <ModeCard
        active={mode === 'teacher'}
        dataTestId="home-identity-teacher"
        icon={<GraduationCap className="size-4" />}
        title={t('teacher.identity.teacherTitle')}
        description={t('teacher.identity.teacherDescription')}
        onSelect={() => onModeChange('teacher')}
      />
    </div>
  );
}

interface ModeCardProps {
  readonly active: boolean;
  readonly dataTestId?: string;
  readonly icon: ReactNode;
  readonly title: string;
  readonly description: string;
  readonly onSelect: () => void;
}

function ModeCard({ active, dataTestId, icon, title, description, onSelect }: ModeCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      data-testid={dataTestId}
      onClick={onSelect}
      className={cn(
        'group relative flex h-auto items-start gap-3 rounded-xl border p-4 text-left transition-all duration-200 cursor-pointer',
        'backdrop-blur shadow-sm',
        active
          ? 'border-violet-400/80 bg-violet-50/90 ring-2 ring-violet-300/60 shadow-md shadow-violet-200/40 dark:border-violet-500/60 dark:bg-violet-950/40 dark:ring-violet-500/40 dark:shadow-violet-900/30'
          : 'border-border/60 bg-white/70 hover:border-violet-300/60 hover:bg-violet-50/40 dark:bg-slate-900/70 dark:hover:border-violet-700/60 dark:hover:bg-violet-950/20',
      )}
    >
      <span
        className={cn(
          'mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors',
          active
            ? 'bg-violet-500 text-white shadow-sm shadow-violet-500/30'
            : 'bg-violet-50 text-violet-600 group-hover:bg-violet-100 dark:bg-violet-900/40 dark:text-violet-300 dark:group-hover:bg-violet-900/60',
        )}
      >
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span
          className={cn(
            'block text-sm font-semibold leading-tight transition-colors',
            active ? 'text-violet-900 dark:text-violet-100' : 'text-foreground/85',
          )}
        >
          {title}
        </span>
        <span
          className={cn(
            'mt-0.5 block text-xs leading-snug transition-colors',
            active ? 'text-violet-700/80 dark:text-violet-300/70' : 'text-muted-foreground',
          )}
        >
          {description}
        </span>
      </span>
    </button>
  );
}

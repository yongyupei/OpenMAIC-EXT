/**
 * @extends-from components/teacher/design-workbench/prompt-override-list.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';

import { PromptOverrideEditorDialog } from '@/components/teacher/design-workbench/prompt-override-editor-dialog';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import { GENERATION_PROMPT_CATALOG } from '@/lib/teacher/generation-prompt-catalog';
import type { GenerationPromptAllowlistId } from '@/lib/prompts/generation-prompt-allowlist';
import type { PromptOverride } from '@/lib/teacher/generation-profile';

export interface PromptOverrideListProps {
  readonly promptOverrides?: Partial<Record<string, PromptOverride>>;
  readonly coursePromptOverrides?: Partial<Record<string, PromptOverride>>;
  readonly disabled?: boolean;
  readonly onChange: (overrides: Partial<Record<string, PromptOverride>> | undefined) => void;
}

export function PromptOverrideList({
  promptOverrides = {},
  coursePromptOverrides = {},
  disabled,
  onChange,
}: PromptOverrideListProps) {
  const { t } = useI18n();
  const [editingId, setEditingId] = useState<GenerationPromptAllowlistId | null>(null);

  const editingEntry = GENERATION_PROMPT_CATALOG.find((e) => e.id === editingId);

  const setOverrideForId = (id: GenerationPromptAllowlistId, value: PromptOverride | undefined) => {
    const next = { ...promptOverrides };
    if (value) {
      next[id] = value;
    } else {
      delete next[id];
    }
    const hasAny = Object.keys(next).length > 0;
    onChange(hasAny ? next : undefined);
  };

  return (
    <>
      <ul className="grid grid-cols-3 gap-2">
        {GENERATION_PROMPT_CATALOG.map((entry) => {
          const chapterOverride = promptOverrides[entry.id];
          const courseOverride = coursePromptOverrides[entry.id];
          const isOverridden = Boolean(
            chapterOverride?.system?.trim() || chapterOverride?.user?.trim(),
          );
          const inheritsCourse =
            !isOverridden &&
            Boolean(courseOverride?.system?.trim() || courseOverride?.user?.trim());

          const statusLabel = isOverridden
            ? t('teacher.design.promptOverride.statusOverridden')
            : inheritsCourse
              ? t('teacher.design.promptOverride.statusInheritsCourse')
              : t('teacher.design.promptOverride.statusBuiltin');

          return (
            <li
              key={entry.id}
              className={cn(
                'flex min-h-[6.5rem] flex-col rounded-md border px-2.5 py-2',
                isOverridden
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                  : 'border-border/60 bg-card',
              )}
            >
              <p className="text-xs font-medium leading-snug">
                {t(`teacher.design.promptCatalog.${entry.labelKey}`)}
              </p>
              <p className="mt-1 line-clamp-2 flex-1 text-[10px] leading-relaxed text-muted-foreground">
                {t(`teacher.design.promptCatalog.${entry.descriptionKey}`)}
              </p>
              <span
                className={cn(
                  'mt-1 text-[10px]',
                  isOverridden ? 'font-medium text-primary' : 'text-muted-foreground',
                )}
              >
                {statusLabel}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 h-7 w-full text-xs"
                disabled={disabled}
                onClick={() => setEditingId(entry.id)}
              >
                <Pencil className="mr-1 size-3" aria-hidden />
                {t('teacher.design.promptOverride.edit')}
              </Button>
            </li>
          );
        })}
      </ul>

      <PromptOverrideEditorDialog
        open={editingId != null}
        onOpenChange={(next) => {
          if (!next) setEditingId(null);
        }}
        promptId={editingId}
        label={
          editingEntry
            ? t(`teacher.design.promptCatalog.${editingEntry.labelKey}`)
            : ''
        }
        override={editingId ? promptOverrides[editingId] : undefined}
        disabled={disabled}
        onSave={(value) => {
          if (editingId) setOverrideForId(editingId, value);
        }}
      />
    </>
  );
}

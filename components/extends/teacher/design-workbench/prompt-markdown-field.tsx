/**
 * @extends-from components/teacher/design-workbench/prompt-markdown-field.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { useState } from 'react';
import { Streamdown } from 'streamdown';

import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

export interface PromptMarkdownFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly disabled?: boolean;
  readonly maxChars: number;
  readonly placeholder: string;
}

export function PromptMarkdownField({
  id,
  label,
  value,
  onChange,
  disabled,
  maxChars,
  placeholder,
}: PromptMarkdownFieldProps) {
  const { t } = useI18n();
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const charCount = value.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <div className="flex items-center gap-3">
          <Tabs
            value={viewMode}
            onValueChange={(next) => {
              if (next === 'edit' || next === 'preview') setViewMode(next);
            }}
          >
            <TabsList className="h-8">
              <TabsTrigger value="edit" className="px-2.5 text-xs">
                {t('teacher.design.promptOverride.modeEdit')}
              </TabsTrigger>
              <TabsTrigger value="preview" className="px-2.5 text-xs">
                {t('teacher.design.promptOverride.modePreview')}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {charCount} / {maxChars}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {viewMode === 'edit' ? (
          <Textarea
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value.slice(0, maxChars))}
            disabled={disabled}
            placeholder={placeholder}
            className={cn(
              'h-full min-h-[min(420px,50vh)] resize-none font-mono text-sm leading-relaxed',
            )}
          />
        ) : (
          <div
            className={cn(
              'not-prose h-full min-h-[min(420px,50vh)] overflow-y-auto overscroll-contain',
              'rounded-md border border-border/60 bg-muted/20 p-4 text-sm',
            )}
            aria-labelledby={id}
          >
            {value.trim() ? (
              <Streamdown className="size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                {value}
              </Streamdown>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t('teacher.design.promptOverride.previewEmpty')}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

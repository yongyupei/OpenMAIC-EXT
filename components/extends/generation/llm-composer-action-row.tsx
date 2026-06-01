/**
 * @extends-from components/generation/llm-composer-action-row.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import type { ReactNode } from 'react';

import { KnowledgePicker } from '@/components/knowledge-base/knowledge-picker';
import { GenerationToolbar } from '@/components/generation/generation-toolbar';
import type { SettingsSection } from '@/lib/types/settings';
import { cn } from '@/lib/utils';

export interface LlmComposerActionRowProps {
  readonly webSearch: boolean;
  readonly onWebSearchChange: (value: boolean) => void;
  readonly onSettingsOpen: (section?: SettingsSection) => void;
  readonly pdfFile: File | null;
  readonly onPdfFileChange: (file: File | null) => void;
  readonly onPdfError: (error: string | null) => void;
  /** Extra controls after the model / PDF / web row (voice, submit, mode toggles, …). */
  readonly trailing?: ReactNode;
  readonly className?: string;
  /** Keep model/tools on one row; use with a horizontally scrollable parent. */
  readonly toolbarSingleLine?: boolean;
  /** When true with toolbarSingleLine, wrap instead of horizontal scroll (no scrollbar). */
  readonly toolbarWrap?: boolean;
  /** Disables model/PDF/web controls (trailing actions stay interactive). */
  readonly toolbarDisabled?: boolean;
  readonly knowledgeNodeIds?: string[];
  readonly onKnowledgeNodeIdsChange?: (ids: string[]) => void;
}

/**
 * Shared bottom row for LLM composer surfaces: model picker, PDF attach, web search,
 * and settings — plus optional trailing actions (home: deep interaction + voice + enter;
 * teacher design chat: voice + send).
 */
export function LlmComposerActionRow({
  webSearch,
  onWebSearchChange,
  onSettingsOpen,
  pdfFile,
  onPdfFileChange,
  onPdfError,
  trailing,
  className,
  toolbarSingleLine = false,
  toolbarWrap = false,
  toolbarDisabled = false,
  knowledgeNodeIds,
  onKnowledgeNodeIdsChange,
}: LlmComposerActionRowProps) {
  const singleLineNoScroll = toolbarSingleLine && toolbarWrap;
  return (
    <div
      className={cn(
        'flex items-end gap-2',
        toolbarSingleLine && !toolbarWrap && 'flex-nowrap',
        className,
      )}
    >
      <div
        className={cn(
          'flex min-w-0 flex-1 flex-wrap items-center gap-2',
          toolbarSingleLine && !toolbarWrap && 'overflow-x-auto',
          singleLineNoScroll && 'overflow-hidden',
          toolbarDisabled && 'pointer-events-none opacity-[0.55]',
        )}
      >
        <GenerationToolbar
          webSearch={webSearch}
          onWebSearchChange={onWebSearchChange}
          onSettingsOpen={onSettingsOpen}
          pdfFile={pdfFile}
          onPdfFileChange={onPdfFileChange}
          onPdfError={onPdfError}
        />
        {onKnowledgeNodeIdsChange && (
          <KnowledgePicker
            selectedNodeIds={knowledgeNodeIds ?? []}
            onChange={onKnowledgeNodeIdsChange}
            disabled={toolbarDisabled}
          />
        )}
      </div>
      {trailing}
    </div>
  );
}

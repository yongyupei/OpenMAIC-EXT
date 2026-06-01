/**
 * @extends-from components/knowledge-base/knowledge-base-assistant.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowUp, Bot, Loader2, Paperclip, X } from 'lucide-react';
import { toast } from 'sonner';

import { SpeechButton } from '@/components/audio/speech-button';
import { LlmComposerActionRow } from '@/components/generation/llm-composer-action-row';
import { ProposalDiffPanel } from '@/components/knowledge-base/proposal-diff-panel';
import { SettingsDialog } from '@/components/settings';
import {
  importKnowledgeFiles,
  requestKnowledgePlan,
} from '@/lib/knowledge-base/client';
import { KNOWLEDGE_FILE_ACCEPT } from '@/lib/knowledge-base/file-types';
import type { AiPlanProposal, KnowledgeNode } from '@/lib/knowledge-base/types';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import type { SettingsSection } from '@/lib/types/settings';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const WEB_SEARCH_STORAGE_KEY = 'webSearchEnabled';

export interface KnowledgeBaseAssistantMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly attachmentNames?: string[];
  readonly proposal?: AiPlanProposal;
}

export interface KnowledgeBaseAssistantProps {
  readonly nodes: readonly KnowledgeNode[];
  readonly selectedNode: KnowledgeNode | null;
  readonly busy?: boolean;
  readonly onRefresh: () => void;
  readonly onProposalCreated?: (proposal: AiPlanProposal) => void;
  readonly onProposalResolved?: () => void;
  readonly className?: string;
}

export function KnowledgeBaseAssistant({
  nodes,
  selectedNode,
  busy: externalBusy,
  onRefresh,
  onProposalCreated,
  onProposalResolved,
  className,
}: KnowledgeBaseAssistantProps) {
  const { t } = useI18n();
  const [messages, setMessages] = useState<KnowledgeBaseAssistantMessage[]>(() => [
    {
      id: 'welcome',
      role: 'assistant',
      content: t('knowledgeBase.assistant.welcome'),
    },
  ]);
  const [draft, setDraft] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [webSearch, setWebSearch] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection | undefined>(
    undefined,
  );
  const [working, setWorking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const currentModelId = useSettingsStore((s) => s.modelId);

  const busy = externalBusy || working;

  /* eslint-disable react-hooks/set-state-in-effect -- Hydrate web search toggle from localStorage */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(WEB_SEARCH_STORAGE_KEY);
      if (saved === 'true') setWebSearch(true);
    } catch {
      /* ignore */
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, busy]);

  const persistWebSearch = (next: boolean) => {
    setWebSearch(next);
    try {
      localStorage.setItem(WEB_SEARCH_STORAGE_KEY, String(next));
    } catch {
      /* ignore */
    }
  };

  const appendPendingFiles = useCallback((files: File[]) => {
    if (files.length === 0) return;
    setPendingFiles((prev) => {
      const next = [...prev];
      for (const file of files) {
        if (next.some((f) => f.name === file.name && f.size === file.size)) continue;
        next.push(file);
      }
      return next;
    });
  }, []);

  const handlePdfFileChange = (file: File | null) => {
    if (file) appendPendingFiles([file]);
    setPdfFile(null);
  };

  const buildContextPrefix = useCallback((): string => {
    const parts: string[] = [];
    if (selectedNode) {
      parts.push(
        t('knowledgeBase.assistant.contextSelected', {
          path: selectedNode.displayPath,
          type: selectedNode.type,
        }),
      );
    }
    const folderCount = nodes.filter((n) => n.type === 'folder').length;
    const fileCount = nodes.filter((n) => n.type === 'file').length;
    parts.push(
      t('knowledgeBase.assistant.contextStats', {
        folders: String(folderCount),
        files: String(fileCount),
      }),
    );
    return parts.join('\n');
  }, [nodes, selectedNode, t]);

  const appendAssistantProposal = useCallback(
    (proposal: AiPlanProposal, usedFallback?: boolean) => {
      const lines = [proposal.summary];
      if (usedFallback) {
        lines.unshift(t('knowledgeBase.importFallback'));
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: lines.join('\n\n'),
          proposal,
        },
      ]);
      onProposalCreated?.(proposal);
    },
    [onProposalCreated, t],
  );

  const canSend =
    !busy && (draft.trim().length > 0 || pendingFiles.length > 0) &&
    (pendingFiles.length > 0 || Boolean(currentModelId?.trim()));

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text && pendingFiles.length === 0) return;
    if (busy) return;

    if (!currentModelId?.trim() && pendingFiles.length === 0) {
      toast.error(t('knowledgeBase.assistant.modelRequired'));
      setSettingsOpen(true);
      return;
    }

    const userContent =
      text ||
      t('knowledgeBase.assistant.uploadOnlyMessage', { count: String(pendingFiles.length) });

    setMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        role: 'user',
        content: userContent,
        attachmentNames: pendingFiles.map((f) => f.name),
      },
    ]);
    setDraft('');
    const filesToSend = [...pendingFiles];
    setPendingFiles([]);
    setWorking(true);

    try {
      if (filesToSend.length > 0) {
        const result = await importKnowledgeFiles(filesToSend);
        appendAssistantProposal(result.proposal, result.usedFallback);
        if (result.usedFallback) {
          toast.info(t('knowledgeBase.importFallback'));
        }
        return;
      }

      const fullMessage = `${buildContextPrefix()}\n\n${text}`;
      const result = await requestKnowledgePlan(fullMessage);
      appendAssistantProposal(result.proposal, result.usedFallback);
      if (result.usedFallback) {
        toast.info(t('knowledgeBase.importFallback'));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('knowledgeBase.assistant.sendFailed'));
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-err-${Date.now()}`,
          role: 'assistant',
          content: t('knowledgeBase.assistant.errorReply'),
        },
      ]);
    } finally {
      setWorking(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      (event.metaKey || event.ctrlKey || !event.nativeEvent.isComposing)
    ) {
      event.preventDefault();
      void handleSubmit();
    }
  };

  const handleProposalApplied = () => {
    setMessages((prev) => [
      ...prev,
      {
        id: `assistant-applied-${Date.now()}`,
        role: 'assistant',
        content: t('knowledgeBase.proposal.applySuccess'),
      },
    ]);
    onProposalResolved?.();
    onRefresh();
  };

  const handleProposalDiscarded = () => {
    setMessages((prev) => [
      ...prev,
      {
        id: `assistant-discard-${Date.now()}`,
        role: 'assistant',
        content: t('knowledgeBase.proposal.discardSuccess'),
      },
    ]);
    onProposalResolved?.();
  };

  const pillMuted =
    'inline-flex h-8 items-center gap-1.5 rounded-full border border-border/50 px-2.5 text-xs font-medium text-muted-foreground/70 transition-all hover:bg-muted/60 hover:text-foreground';

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-white/80 shadow-sm backdrop-blur dark:bg-slate-900/80',
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-4 py-3">
        <Bot className="size-5 text-violet-600 dark:text-violet-400" />
        <div>
          <h2 className="text-sm font-semibold">{t('knowledgeBase.assistant.title')}</h2>
          <p className="text-xs text-muted-foreground">{t('knowledgeBase.assistant.subtitle')}</p>
        </div>
      </div>

      <div ref={scrollerRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.map((message) => (
          <ChatBubble
            key={message.id}
            message={message}
            busy={busy}
            onApplied={handleProposalApplied}
            onDiscarded={handleProposalDiscarded}
          />
        ))}
        {busy ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t('knowledgeBase.assistant.thinking')}
          </div>
        ) : null}
      </div>

      {pendingFiles.length > 0 ? (
        <div className="flex shrink-0 flex-wrap gap-2 border-t border-border/40 px-3 py-2">
          {pendingFiles.map((file) => (
            <div
              key={`${file.name}-${file.size}`}
              className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs"
            >
              <span className="max-w-[140px] truncate">{file.name}</span>
              <button
                type="button"
                className="rounded-full p-0.5 hover:bg-background"
                onClick={() =>
                  setPendingFiles((prev) => prev.filter((f) => f !== file))
                }
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <form
        className="shrink-0 border-t border-border/60 px-3 py-3"
        onSubmit={(e) => void handleSubmit(e)}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={KNOWLEDGE_FILE_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const picked = e.target.files ? [...e.target.files] : [];
            e.target.value = '';
            appendPendingFiles(picked);
          }}
        />
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('knowledgeBase.assistant.inputPlaceholder')}
          disabled={busy}
          className="min-h-[80px] resize-none border-border/40 bg-transparent text-sm placeholder:text-muted-foreground/60 focus-visible:ring-1"
        />
        <div className="pt-2">
          <LlmComposerActionRow
            toolbarSingleLine
            toolbarWrap
            toolbarDisabled={busy}
            webSearch={webSearch}
            onWebSearchChange={persistWebSearch}
            onSettingsOpen={(section) => {
              setSettingsSection(section);
              setSettingsOpen(true);
            }}
            pdfFile={pdfFile}
            onPdfFileChange={handlePdfFileChange}
            onPdfError={(msg) => {
              if (msg) toast.error(msg);
            }}
            trailing={
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        pillMuted,
                        'shrink-0',
                        pendingFiles.length > 0 &&
                          'border-violet-200/60 bg-violet-100 text-violet-700 dark:border-violet-700/50 dark:bg-violet-900/30 dark:text-violet-300',
                      )}
                      disabled={busy}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Paperclip className="size-3.5" />
                      {pendingFiles.length > 0 ? (
                        <span>{pendingFiles.length}</span>
                      ) : null}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {t('knowledgeBase.assistant.attach')}
                  </TooltipContent>
                </Tooltip>

                <SpeechButton
                  size="md"
                  disabled={busy}
                  onTranscription={(text) => {
                    setDraft((prev) => prev + (prev ? ' ' : '') + text);
                  }}
                />

                <button
                  type="submit"
                  disabled={!canSend}
                  className={cn(
                    'flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-all',
                    canSend
                      ? 'cursor-pointer bg-primary text-primary-foreground shadow-sm hover:opacity-90'
                      : 'cursor-not-allowed bg-muted text-muted-foreground/40',
                  )}
                >
                  <span>{t('knowledgeBase.assistant.send')}</span>
                  <ArrowUp className="size-3.5" />
                </button>
              </>
            }
          />
        </div>
      </form>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) setSettingsSection(undefined);
        }}
        initialSection={settingsSection}
      />
    </div>
  );
}

function ChatBubble({
  message,
  busy,
  onApplied,
  onDiscarded,
}: {
  message: KnowledgeBaseAssistantMessage;
  busy: boolean;
  onApplied: () => void;
  onDiscarded: () => void;
}) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[95%] rounded-2xl px-3 py-2 text-sm',
          isUser
            ? 'bg-violet-600 text-white dark:bg-violet-700'
            : 'bg-muted/80 text-foreground',
        )}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        {message.attachmentNames && message.attachmentNames.length > 0 ? (
          <div className="mt-2 space-y-0.5 text-xs opacity-90">
            {message.attachmentNames.map((name) => (
              <p key={name}>📎 {name}</p>
            ))}
          </div>
        ) : null}
        {message.proposal ? (
          <div className="mt-3">
            <ProposalDiffPanel
              proposal={message.proposal}
              onApplied={onApplied}
              onDiscarded={onDiscarded}
              busy={busy}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

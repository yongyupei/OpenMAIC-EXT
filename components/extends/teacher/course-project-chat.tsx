/**
 * @extends-from components/teacher/course-project-chat.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  ArrowUp,
  Bot,
  BotOff,
  Brain,
  ChevronDown,
  ChevronRight,
  Loader2,
  OctagonX,
  RotateCcw,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Square,
  User,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';

import { SpeechButton } from '@/components/audio/speech-button';
import { LlmComposerActionRow } from '@/components/generation/llm-composer-action-row';
import { SettingsDialog } from '@/components/settings';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import type { SettingsSection } from '@/lib/types/settings';
import { cn } from '@/lib/utils';
import type {
  CourseProjectChatMessage,
  CourseProjectChatToolEvent,
} from '@/lib/teacher/design-chat-types';

export type {
  ChatMessageRole,
  CourseProjectChatMessage,
  CourseProjectChatToolEvent,
} from '@/lib/teacher/design-chat-types';

const WEB_SEARCH_STORAGE_KEY = 'webSearchEnabled';

interface CourseProjectChatProps {
  readonly messages: readonly CourseProjectChatMessage[];
  readonly streamingId: string | null;
  readonly busy: boolean;
  readonly disabled?: boolean;
  readonly errorMessage?: string | null;
  readonly onSendMessage: (text: string) => void;
  readonly onCancel?: () => void;
  readonly onRetry?: () => void;
  readonly onRegenerate?: () => void;
  readonly className?: string;
  readonly agentSystemPrompt?: string;
  readonly onAgentSystemPromptChange?: (value: string) => void;
}

export function CourseProjectChat({
  messages,
  streamingId,
  busy,
  disabled = false,
  errorMessage,
  onSendMessage,
  onCancel,
  onRetry,
  onRegenerate,
  className,
  agentSystemPrompt = '',
  onAgentSystemPromptChange,
}: CourseProjectChatProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState('');
  const [webSearch, setWebSearch] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection | undefined>(undefined);
  const [agentPopoverOpen, setAgentPopoverOpen] = useState(false);
  const [agentDraft, setAgentDraft] = useState(agentSystemPrompt);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const currentModelId = useSettingsStore((s) => s.modelId);

  /* eslint-disable react-hooks/set-state-in-effect -- Sync draft when popover opens */
  useEffect(() => {
    if (!agentPopoverOpen) return;
    setAgentDraft(agentSystemPrompt);
  }, [agentPopoverOpen, agentSystemPrompt]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, busy]);

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

  const persistWebSearch = (next: boolean) => {
    setWebSearch(next);
    try {
      localStorage.setItem(WEB_SEARCH_STORAGE_KEY, String(next));
    } catch {
      /* ignore */
    }
  };

  const showModelSetupToast = () => {
    toast.custom(
      (id) => (
        <div
          className="flex w-[356px] cursor-pointer items-start gap-3 rounded-xl border border-amber-200/60 bg-gradient-to-r from-amber-50 via-white to-amber-50 p-4 shadow-lg shadow-amber-500/8 dark:border-amber-800/40 dark:from-amber-950/60 dark:via-slate-900 dark:to-amber-950/60 dark:shadow-amber-900/20"
          onClick={() => {
            toast.dismiss(id);
            setSettingsOpen(true);
          }}
        >
          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 ring-1 ring-amber-200/50 dark:bg-amber-900/40 dark:ring-amber-800/30">
            <BotOff className="size-4.5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight text-amber-900 dark:text-amber-200">
              {t('settings.modelNotConfigured')}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-700/80 dark:text-amber-400/70">
              {t('settings.setupNeeded')}
            </p>
          </div>
          <Settings className="mt-1 size-3.5 shrink-0 text-amber-500 dark:text-amber-500/70" />
        </div>
      ),
      { duration: 4000 },
    );
  };

  const canSend = draft.trim() !== '' && !busy && !disabled && Boolean(currentModelId?.trim());

  const submit = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || busy || disabled) return;
    if (!currentModelId?.trim()) {
      showModelSetupToast();
      setSettingsOpen(true);
      return;
    }
    onSendMessage(trimmed);
    setDraft('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      (event.metaKey || event.ctrlKey || !event.nativeEvent.isComposing)
    ) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <aside
      aria-label={t('teacher.create.chat.ariaLabel')}
      className={cn(
        'flex w-full min-h-0 flex-col rounded-2xl border border-slate-200/70 bg-white/85 shadow-xl shadow-purple-100/40 backdrop-blur dark:border-slate-800 dark:bg-slate-900/85 dark:shadow-purple-950/20',
        'h-[min(640px,calc(100dvh-12rem))] max-h-[calc(100dvh-12rem)] lg:h-full lg:max-h-none',
        className,
      )}
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200/60 px-4 py-3 dark:border-slate-800">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-300">
            <Sparkles className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground/90">
              {t('teacher.create.chat.title')}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {t('teacher.create.chat.subtitle')}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onAgentSystemPromptChange ? (
            <Popover open={agentPopoverOpen} onOpenChange={setAgentPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1 px-2 text-xs"
                  title={t('teacher.create.chat.agent.openTitle')}
                >
                  <SlidersHorizontal className="size-3.5" />
                  <span className="hidden sm:inline">
                    {t('teacher.create.chat.agent.openLabel')}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[min(100vw-2rem,380px)] space-y-3 p-3" align="end">
                <div>
                  <p className="text-sm font-medium">
                    {t('teacher.create.chat.agent.systemPromptLabel')}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {t('teacher.create.chat.agent.systemPromptHint')}
                  </p>
                </div>
                <Textarea
                  value={agentDraft}
                  onChange={(e) => setAgentDraft(e.target.value)}
                  placeholder={t('teacher.create.chat.agent.systemPromptPlaceholder')}
                  className="min-h-[120px] resize-y text-sm"
                  maxLength={6000}
                />
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setAgentDraft('');
                      onAgentSystemPromptChange('');
                    }}
                  >
                    {t('teacher.create.chat.agent.reset')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      onAgentSystemPromptChange(agentDraft.trim());
                      setAgentPopoverOpen(false);
                    }}
                  >
                    {t('teacher.create.chat.agent.save')}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          ) : null}
          {onRegenerate ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 text-xs text-muted-foreground"
              onClick={onRegenerate}
              disabled={busy || disabled}
              title={t('teacher.create.chat.regenerate')}
            >
              <RotateCcw className="size-3.5" />
              <span className="ml-1 hidden sm:inline">{t('teacher.create.chat.regenerate')}</span>
            </Button>
          ) : null}
        </div>
      </header>

      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4">
        {messages.length === 0 ? (
          <ChatEmptyState />
        ) : (
          <ul className="flex flex-col gap-4">
            {messages.map((message) => (
              <li key={message.id}>
                <ChatBubble message={message} streaming={streamingId === message.id} />
              </li>
            ))}
            {busy && !streamingId ? (
              <li>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>{t('teacher.create.chat.thinking')}</span>
                </div>
              </li>
            ) : null}
          </ul>
        )}
      </div>

      {errorMessage ? (
        <div
          className="mx-4 mb-2 flex shrink-0 items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          <span className="flex-1">{errorMessage}</span>
          {onRetry ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px] text-red-700 hover:bg-red-100/60 dark:text-red-200 dark:hover:bg-red-900/40"
              onClick={onRetry}
              disabled={busy || disabled}
            >
              <RotateCcw className="size-3" />
              <span className="ml-1">{t('teacher.create.chat.retry')}</span>
            </Button>
          ) : null}
        </div>
      ) : null}

      <form
        className="shrink-0 border-t border-slate-200/60 px-3 py-3 dark:border-slate-800"
        onSubmit={submit}
      >
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('teacher.create.chat.inputPlaceholder')}
          disabled={disabled || busy}
          className="min-h-[80px] resize-none border-border/40 bg-transparent text-sm placeholder:text-muted-foreground/60 focus-visible:ring-1"
        />
        <div className="pt-2">
          <LlmComposerActionRow
            toolbarSingleLine
            toolbarWrap
            toolbarDisabled={busy || disabled}
            webSearch={webSearch}
            onWebSearchChange={persistWebSearch}
            onSettingsOpen={(section) => {
              setSettingsSection(section);
              setSettingsOpen(true);
            }}
            pdfFile={pdfFile}
            onPdfFileChange={setPdfFile}
            onPdfError={(msg) => {
              if (msg) toast.error(msg);
            }}
            trailing={
              busy && onCancel ? (
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  className="h-8 shrink-0 gap-1.5 px-3"
                  onClick={onCancel}
                >
                  <Square className="size-3.5" />
                  <span>{t('teacher.create.chat.stop')}</span>
                </Button>
              ) : (
                <>
                  <SpeechButton
                    size="md"
                    disabled={disabled}
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
                    <span>{t('teacher.create.chat.send')}</span>
                    <ArrowUp className="size-3.5" />
                  </button>
                </>
              )
            }
          />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {t('teacher.create.chat.inputHint')}
        </p>
      </form>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) setSettingsSection(undefined);
        }}
        initialSection={settingsSection}
      />
    </aside>
  );
}

function ChatEmptyState() {
  const { t } = useI18n();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center text-sm text-muted-foreground">
      <span className="inline-flex size-9 items-center justify-center rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-300">
        <Bot className="size-4" />
      </span>
      <p className="font-medium text-foreground/85">{t('teacher.create.chat.emptyTitle')}</p>
      <p className="px-4 text-xs leading-relaxed text-muted-foreground">
        {t('teacher.create.chat.emptyDescription')}
      </p>
    </div>
  );
}

function ChatBubble({
  message,
  streaming,
}: {
  message: CourseProjectChatMessage;
  streaming: boolean;
}) {
  const { t } = useI18n();
  const isUser = message.role === 'user';
  const showCaret = streaming && !isUser && !message.cancelled;
  const showThinkingDots =
    streaming && !isUser && message.content.length === 0 && !message.cancelled;
  return (
    <div className={cn('flex gap-2', isUser ? 'flex-row-reverse text-right' : 'flex-row')}>
      <span
        className={cn(
          'mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full',
          isUser
            ? 'bg-violet-500 text-white'
            : 'bg-violet-500/15 text-violet-600 dark:text-violet-300',
        )}
      >
        {isUser ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
      </span>
      <div className={cn('flex max-w-[85%] flex-col gap-2', isUser ? 'items-end' : 'items-start')}>
        {!isUser && message.reasoning ? (
          <ReasoningBlock text={message.reasoning} streaming={streaming} />
        ) : null}
        {showThinkingDots ? (
          <div className="rounded-2xl bg-slate-100 px-3.5 py-2 text-sm text-muted-foreground dark:bg-slate-800">
            <span className="inline-flex items-center gap-1">
              <span
                className="size-1.5 animate-bounce rounded-full bg-violet-400"
                style={{ animationDelay: '0ms' }}
              />
              <span
                className="size-1.5 animate-bounce rounded-full bg-violet-400"
                style={{ animationDelay: '150ms' }}
              />
              <span
                className="size-1.5 animate-bounce rounded-full bg-violet-400"
                style={{ animationDelay: '300ms' }}
              />
            </span>
          </div>
        ) : message.content.length > 0 ? (
          <div
            className={cn(
              'whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
              isUser
                ? 'bg-violet-500 text-white'
                : 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-50',
            )}
          >
            {message.content}
            {showCaret ? (
              <span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-[2px] animate-pulse bg-violet-500" />
            ) : null}
          </div>
        ) : null}
        {!isUser && message.cancelled ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-200">
            <OctagonX className="size-3" />
            {t('teacher.create.chat.cancelledLabel')}
          </span>
        ) : null}
        {!isUser && message.toolEvents && message.toolEvents.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {message.toolEvents.map((event) => (
              <ToolEventBadge key={event.id} event={event} />
            ))}
            <p className="text-[10px] text-muted-foreground">
              {t('teacher.create.chat.autoAppliedHint')}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ToolEventBadge({ event }: { event: CourseProjectChatToolEvent }) {
  const { t } = useI18n();
  if (event.kind === 'skipped') {
    return (
      <div className="flex max-w-md items-start gap-2 rounded-lg border border-slate-200/80 bg-slate-50/90 px-2.5 py-1.5 text-[11px] text-muted-foreground dark:border-slate-700 dark:bg-slate-900/60">
        <Wand2 className="mt-0.5 size-3 shrink-0 opacity-60" />
        <span className="flex-1">
          {t('teacher.create.chat.toolEvent.skipped')}
          {event.reason ? ` — ${event.reason}` : ''}
        </span>
      </div>
    );
  }

  const bodyKey = `teacher.create.chat.toolEvent.${event.kind}` as const;
  const label = event.label?.trim();
  const detail =
    event.kind === 'overviewUpdated' || event.kind === 'chaptersReordered'
      ? ''
      : label
        ? truncatePreview(label, 80)
        : '';

  return (
    <div className="flex max-w-md items-start gap-2 rounded-lg border border-violet-200/70 bg-violet-50/80 px-2.5 py-1.5 text-[11px] text-violet-800 dark:border-violet-800/60 dark:bg-violet-950/40 dark:text-violet-200">
      <Wand2 className="mt-0.5 size-3 shrink-0" />
      <span className="flex-1">
        <span className="font-medium">{t(bodyKey)}</span>
        {detail ? (
          <span className="ml-1 break-all font-mono text-foreground/85">→ {detail}</span>
        ) : null}
      </span>
    </div>
  );
}

function truncatePreview(value: string, maxLength = 240): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}…`;
}

function ReasoningBlock({ text, streaming }: { text: string; streaming: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const trimmed = text.trim();
  if (!trimmed) return null;
  return (
    <div className="w-full max-w-md rounded-xl border border-slate-200/80 bg-slate-50/70 text-left text-[11px] dark:border-slate-700/70 dark:bg-slate-900/60">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-slate-600 transition-colors hover:bg-slate-100/70 dark:text-slate-300 dark:hover:bg-slate-800/60"
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <Brain className="size-3" />
        <span className="font-medium">{t('teacher.create.chat.reasoningLabel')}</span>
        {streaming ? (
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-violet-600 dark:text-violet-300">
            <span className="size-1.5 animate-pulse rounded-full bg-violet-500" />
            {t('teacher.create.chat.reasoningStreaming')}
          </span>
        ) : (
          <span className="ml-auto text-[10px] text-muted-foreground">
            {t('teacher.create.chat.reasoningCharCount', { count: trimmed.length })}
          </span>
        )}
      </button>
      {open ? (
        <div className="border-t border-slate-200/60 px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-slate-700 dark:border-slate-700/60 dark:text-slate-300">
          {trimmed}
        </div>
      ) : null}
    </div>
  );
}

/**
 * @extends-from components/teacher/teacher-assist-panel.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/hooks/use-i18n';
import {
  getTeacherGenerationHeaders,
  withCurrentTeacherThinkingConfig,
} from '@/lib/teacher/client-generation-config';
import { generateId } from '@/lib/api/stage-api-defaults';
import { cn } from '@/lib/utils';

const teacherAssistScopes = ['outline', 'chapter', 'slide', 'quiz'] as const;
export type TeacherAssistScope = (typeof teacherAssistScopes)[number];

type TeacherAssistResponse = { success: true; suggestion: string } | { success?: false };

interface AssistMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly scope: TeacherAssistScope;
  readonly status?: 'loading' | 'error';
}

interface TeacherAssistPanelProps {
  readonly defaultScope?: TeacherAssistScope;
  readonly context?: unknown;
  readonly onApplySuggestion?: (suggestion: string, scope: TeacherAssistScope) => void;
}

export function TeacherAssistPanel({
  defaultScope = 'outline',
  context,
  onApplySuggestion,
}: TeacherAssistPanelProps) {
  const { t } = useI18n();
  const [scope, setScope] = useState<TeacherAssistScope>(defaultScope);
  const [instruction, setInstruction] = useState('');
  const [messages, setMessages] = useState<AssistMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const requestVersion = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const trimmedInstruction = instruction.trim();
  const canSubmit = trimmedInstruction !== '' && !isLoading;

  // Reset messages when context changes (e.g., scene switched)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      requestVersion.current += 1;
      setMessages([]);
      setIsLoading(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [context]);

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    const currentVersion = requestVersion.current + 1;
    requestVersion.current = currentVersion;

    const userMessage: AssistMessage = {
      id: generateId(),
      role: 'user',
      content: trimmedInstruction,
      scope,
    };
    const loadingMessage: AssistMessage = {
      id: generateId(),
      role: 'assistant',
      content: '',
      scope,
      status: 'loading',
    };

    setMessages((prev) => [...prev, userMessage, loadingMessage]);
    setInstruction('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/extends/teacher/assist', {
        method: 'POST',
        headers: getTeacherGenerationHeaders(),
        body: JSON.stringify(
          withCurrentTeacherThinkingConfig({
            scope,
            instruction: trimmedInstruction,
            context,
          }),
        ),
      });
      if (requestVersion.current !== currentVersion) return;

      const json = (await response.json()) as TeacherAssistResponse;
      if (requestVersion.current !== currentVersion) return;

      if (response.ok && json.success) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === loadingMessage.id
              ? { ...loadingMessage, content: json.suggestion, status: undefined }
              : m,
          ),
        );
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === loadingMessage.id ? { ...loadingMessage, status: 'error' } : m,
          ),
        );
      }
    } catch {
      if (requestVersion.current !== currentVersion) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === loadingMessage.id ? { ...loadingMessage, status: 'error' } : m)),
      );
    } finally {
      if (requestVersion.current === currentVersion) setIsLoading(false);
    }
  };

  const retryMessage = useCallback(
    async (msg: AssistMessage) => {
      if (isLoading) return;
      const currentVersion = requestVersion.current + 1;
      requestVersion.current = currentVersion;

      const loadingMsg: AssistMessage = { ...msg, status: 'loading', content: '' };
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? loadingMsg : m)));
      setIsLoading(true);

      try {
        const response = await fetch('/api/extends/teacher/assist', {
          method: 'POST',
          headers: getTeacherGenerationHeaders(),
          body: JSON.stringify(
            withCurrentTeacherThinkingConfig({
              scope: msg.scope,
              instruction: messages[messages.findIndex((m) => m.id === msg.id) - 1]?.content ?? '',
              context,
            }),
          ),
        });
        if (requestVersion.current !== currentVersion) return;
        const json = (await response.json()) as TeacherAssistResponse;
        if (requestVersion.current !== currentVersion) return;

        if (response.ok && json.success) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msg.id ? { ...loadingMsg, content: json.suggestion, status: undefined } : m,
            ),
          );
        } else {
          setMessages((prev) =>
            prev.map((m) => (m.id === msg.id ? { ...loadingMsg, status: 'error' } : m)),
          );
        }
      } catch {
        if (requestVersion.current !== currentVersion) return;
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...loadingMsg, status: 'error' } : m)),
        );
      } finally {
        if (requestVersion.current === currentVersion) setIsLoading(false);
      }
    },
    [context, isLoading, messages],
  );

  return (
    <section className="flex h-full min-h-0 flex-col rounded-2xl border border-slate-200/70 bg-white/85 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/85">
      {/* Header */}
      <div className="shrink-0 space-y-1 border-b border-slate-100 px-4 pt-4 pb-3 dark:border-slate-800">
        <p className="text-xs font-medium text-purple-600 dark:text-purple-300">
          {t('teacher.assist.eyebrow')}
        </p>
        <h2 className="text-base font-semibold tracking-tight">{t('teacher.assist.title')}</h2>
        <div className="pt-1">
          <Select value={scope} onValueChange={(v) => setScope(v as TeacherAssistScope)}>
            <SelectTrigger className="h-7 w-full text-xs sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {teacherAssistScopes.map((item) => (
                <SelectItem key={item} value={item} className="text-xs">
                  {t(`teacher.assist.scopes.${item}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Message history */}
      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            {t('teacher.assist.description')}
          </p>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              {msg.role === 'user' ? (
                <div className="max-w-[85%] rounded-xl rounded-br-sm bg-purple-50 px-3 py-2 text-xs text-slate-800 dark:bg-purple-950/50 dark:text-slate-100">
                  <p className="whitespace-pre-wrap leading-5">{msg.content}</p>
                </div>
              ) : (
                <div className="max-w-[90%] space-y-2 rounded-xl rounded-bl-sm border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800/60">
                  {msg.status === 'loading' ? (
                    <div className="flex gap-1 py-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
                    </div>
                  ) : msg.status === 'error' ? (
                    <div className="space-y-1">
                      <p className="text-red-600 dark:text-red-400">{t('teacher.assist.error')}</p>
                      <button
                        type="button"
                        className="text-xs text-purple-600 underline dark:text-purple-400"
                        onClick={() => void retryMessage(msg)}
                      >
                        {t('teacher.assist.generateButton')}
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="whitespace-pre-wrap leading-5 text-slate-700 dark:text-slate-200">
                        {msg.content}
                      </p>
                      {onApplySuggestion && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-xs"
                          onClick={() => onApplySuggestion(msg.content, msg.scope)}
                        >
                          {t('teacher.assist.applyButton')}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Input area */}
      <form
        className="shrink-0 border-t border-slate-100 px-4 py-3 dark:border-slate-800"
        onSubmit={(e) => void sendMessage(e)}
      >
        <Textarea
          className="min-h-16 resize-none text-xs"
          value={instruction}
          placeholder={t('teacher.assist.instructionPlaceholder')}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div className="mt-2 flex justify-end">
          <Button type="submit" size="sm" disabled={!canSubmit}>
            {isLoading ? t('teacher.assist.generatingButton') : t('teacher.assist.generateButton')}
          </Button>
        </div>
      </form>
    </section>
  );
}

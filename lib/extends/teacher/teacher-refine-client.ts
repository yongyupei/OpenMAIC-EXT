/**
 * @extends-from lib/teacher/teacher-refine-client.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import {
  getTeacherGenerationHeaders,
  withCurrentTeacherThinkingConfig,
} from '@/lib/teacher/client-generation-config';

import type { GenerationMode } from '@/lib/slide-templates/types';
import type { GenerationProfileOverride } from '@/lib/teacher/generation-profile';

export interface ChapterSnapshot {
  id: string;
  title: string;
  learningObjectives: string[];
  summary: string;
  deepSearchEnabled?: boolean;
  knowledgeNodeIds?: string[];
  slideTemplateId?: string;
  generationMode?: GenerationMode;
  generationProfileOverride?: GenerationProfileOverride;
}

export interface CourseProjectFormState {
  overview: string;
  chapters: ChapterSnapshot[];
}

export type ChatRole = 'user' | 'assistant';

export interface ChatTranscriptMessage {
  role: ChatRole;
  content: string;
}

export interface ToolCallPayload {
  toolName: string;
  input: unknown;
}

export interface CourseProjectStreamCallbacks {
  onStart?: () => void;
  onReplyDelta: (delta: string) => void;
  onReasoningDelta?: (delta: string) => void;
  onToolCall: (call: ToolCallPayload) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

interface CourseProjectStreamParams {
  formState: CourseProjectFormState;
  messages: ChatTranscriptMessage[];
  baseRequirement?: string;
  /** Optional extra system instructions (teacher-configured design agent). */
  systemInstructions?: string;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  callbacks: CourseProjectStreamCallbacks;
}

export interface CourseProjectStreamResult {
  status: 'completed' | 'aborted' | 'failed';
  error?: string;
}

export async function streamCourseProjectRefine({
  formState,
  messages,
  baseRequirement,
  systemInstructions,
  signal,
  fetcher = fetch,
  callbacks,
}: CourseProjectStreamParams): Promise<CourseProjectStreamResult> {
  let response: Response;
  try {
    response = await fetcher('/api/extends/teacher/projects/refine', {
      method: 'POST',
      headers: getTeacherGenerationHeaders(),
      body: JSON.stringify(
        withCurrentTeacherThinkingConfig({
          formState,
          messages,
          baseRequirement: baseRequirement ?? '',
          ...(systemInstructions?.trim() ? { systemInstructions: systemInstructions.trim() } : {}),
        }),
      ),
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) return { status: 'aborted' };
    const message = error instanceof Error ? error.message : String(error);
    callbacks.onError(message);
    return { status: 'failed', error: message };
  }

  if (!response.ok || !response.body) {
    let detail = `HTTP ${response.status}`;
    try {
      const text = await response.text();
      if (text) detail = text;
    } catch {
      /* ignore */
    }
    callbacks.onError(detail);
    return { status: 'failed', error: detail };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let streamError: string | null = null;
  let didFinish = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let separatorIndex = buffer.indexOf('\n\n');
      while (separatorIndex !== -1) {
        const rawEvent = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        separatorIndex = buffer.indexOf('\n\n');

        const dataLines = rawEvent
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart());
        if (dataLines.length === 0) continue;

        const payload = dataLines.join('\n');
        let event: unknown;
        try {
          event = JSON.parse(payload);
        } catch {
          continue;
        }

        const result = handleEvent(event, callbacks);
        if (result === 'done') didFinish = true;
        else if (typeof result === 'string') streamError = result;
      }
    }
  } catch (error) {
    if (isAbortError(error)) return { status: 'aborted' };
    const message = error instanceof Error ? error.message : String(error);
    if (!streamError) callbacks.onError(message);
    return { status: 'failed', error: streamError ?? message };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }

  if (streamError) return { status: 'failed', error: streamError };
  if (!didFinish) callbacks.onDone();
  return { status: 'completed' };
}

function handleEvent(
  event: unknown,
  callbacks: CourseProjectStreamCallbacks,
): 'done' | 'continue' | string {
  if (!event || typeof event !== 'object') return 'continue';
  const candidate = event as { type?: unknown };

  if (candidate.type === 'start') {
    callbacks.onStart?.();
    return 'continue';
  }
  if (candidate.type === 'reply-delta') {
    const delta = (event as { delta?: unknown }).delta;
    if (typeof delta === 'string' && delta.length > 0) callbacks.onReplyDelta(delta);
    return 'continue';
  }
  if (candidate.type === 'reasoning-delta') {
    const delta = (event as { delta?: unknown }).delta;
    if (typeof delta === 'string' && delta.length > 0 && callbacks.onReasoningDelta) {
      callbacks.onReasoningDelta(delta);
    }
    return 'continue';
  }
  if (candidate.type === 'tool-call') {
    const toolName = (event as { toolName?: unknown }).toolName;
    const input = (event as { input?: unknown }).input;
    if (typeof toolName === 'string') callbacks.onToolCall({ toolName, input });
    return 'continue';
  }
  if (candidate.type === 'done') {
    callbacks.onDone();
    return 'done';
  }
  if (candidate.type === 'error') {
    const errorValue = (event as { error?: unknown }).error;
    const message = typeof errorValue === 'string' ? errorValue : 'Unknown stream error';
    callbacks.onError(message);
    return message;
  }
  return 'continue';
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

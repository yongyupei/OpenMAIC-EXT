/**
 * @extends-from lib/teacher/design-chat-validation.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import type { ToolEventKind } from '@/lib/teacher/design-shell-reducer';
import type {
  CourseProjectChatMessage,
  CourseProjectChatToolEvent,
  CourseProjectDesignWorkbenchChat,
} from '@/lib/teacher/design-chat-types';

const TOOL_EVENT_KINDS = new Set<ToolEventKind>([
  'overviewUpdated',
  'chapterAdded',
  'chapterUpdated',
  'chapterRemoved',
  'chaptersReordered',
  'skipped',
]);

const MAX_MESSAGES = 250;
const MAX_TEXT_FIELD = 120_000;
const MAX_TOOL_EVENTS_PER_MESSAGE = 80;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseToolEvent(value: unknown): CourseProjectChatToolEvent | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || value.id.length > 200) return null;
  if (typeof value.kind !== 'string' || !TOOL_EVENT_KINDS.has(value.kind as ToolEventKind))
    return null;
  const out: CourseProjectChatToolEvent = {
    id: value.id,
    kind: value.kind as ToolEventKind,
  };
  if (typeof value.label === 'string') out.label = value.label.slice(0, 2000);
  if (typeof value.reason === 'string') out.reason = value.reason.slice(0, 4000);
  return out;
}

function parseMessage(value: unknown): CourseProjectChatMessage | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || value.id.length > 200) return null;
  if (value.role !== 'user' && value.role !== 'assistant') return null;
  if (typeof value.content !== 'string') return null;
  const content = value.content.slice(0, MAX_TEXT_FIELD);
  const out: CourseProjectChatMessage = {
    id: value.id,
    role: value.role,
    content,
  };
  if (typeof value.reasoning === 'string') {
    out.reasoning = value.reasoning.slice(0, MAX_TEXT_FIELD);
  }
  if (value.cancelled === true) {
    out.cancelled = true;
  }
  if (Array.isArray(value.toolEvents)) {
    const events: CourseProjectChatToolEvent[] = [];
    for (const ev of value.toolEvents.slice(0, MAX_TOOL_EVENTS_PER_MESSAGE)) {
      const parsed = parseToolEvent(ev);
      if (parsed) events.push(parsed);
    }
    if (events.length > 0) out.toolEvents = events;
  }
  return out;
}

/** Validates API PATCH body field `designWorkbenchChat`. */
export function parseDesignWorkbenchChatFromPatchBody(
  value: unknown,
): CourseProjectDesignWorkbenchChat | null {
  if (!isRecord(value)) return null;
  if (!Array.isArray(value.messages)) return null;
  const messages: CourseProjectChatMessage[] = [];
  for (const entry of value.messages.slice(0, MAX_MESSAGES)) {
    const m = parseMessage(entry);
    if (m) messages.push(m);
  }
  return {
    messages,
    updatedAt: new Date().toISOString(),
  };
}

/** Best-effort parse from stored JSON (disk); drops invalid entries. */
export function normalizeDesignWorkbenchChatFromStorage(
  value: unknown,
): CourseProjectDesignWorkbenchChat | undefined {
  if (!isRecord(value)) return undefined;
  if (!Array.isArray(value.messages)) return undefined;
  const messages: CourseProjectChatMessage[] = [];
  for (const entry of value.messages.slice(0, MAX_MESSAGES)) {
    const m = parseMessage(entry);
    if (m) messages.push(m);
  }
  if (messages.length === 0) return undefined;
  const updatedAt =
    typeof value.updatedAt === 'string' && value.updatedAt.length > 0
      ? value.updatedAt
      : new Date().toISOString();
  return { messages, updatedAt };
}

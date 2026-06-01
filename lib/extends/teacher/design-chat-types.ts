/**
 * @extends-from lib/teacher/design-chat-types.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import type { ToolEventKind } from '@/lib/teacher/design-shell-reducer';

export type ChatMessageRole = 'user' | 'assistant';

export interface CourseProjectChatToolEvent {
  id: string;
  kind: ToolEventKind;
  label?: string;
  reason?: string;
}

export interface CourseProjectChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  reasoning?: string;
  toolEvents?: CourseProjectChatToolEvent[];
  cancelled?: boolean;
}

/** Persisted shape under {@link import('./course-types').CourseProject.designWorkbenchChat}. */
export interface CourseProjectDesignWorkbenchChat {
  readonly messages: CourseProjectChatMessage[];
  readonly updatedAt: string;
}

/**
 * @extends-from app/api/extends/teacher/projects/refine/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { type NextRequest } from 'next/server';
import { tool } from 'ai';
import { z } from 'zod';

import { streamLLM } from '@/lib/ai/llm';
import { createLogger } from '@/lib/logger';
import { API_ERROR_CODES, apiError } from '@/lib/server/api-response';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';

const log = createLogger('Teacher Project Refine API');

export const maxDuration = 120;

const MAX_MESSAGES = 24;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_REQUIREMENT_LENGTH = 8000;
const MAX_OVERVIEW_LENGTH = 4000;
const MAX_TITLE_LENGTH = 200;
const MAX_OBJECTIVE_LENGTH = 200;
const MAX_OBJECTIVES_PER_CHAPTER = 12;
const MAX_SUMMARY_LENGTH = 1500;
const MAX_CHAPTERS = 12;
const HEARTBEAT_INTERVAL_MS = 15_000;
const MAX_SYSTEM_INSTRUCTIONS = 6000;

type ChatRole = 'user' | 'assistant';

interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface ChapterSnapshot {
  id: string;
  title: string;
  learningObjectives: string[];
  summary: string;
}

interface FormStatePayload {
  overview: string;
  chapters: ChapterSnapshot[];
}

interface RefineRequestBody {
  formState?: unknown;
  messages?: unknown;
  baseRequirement?: unknown;
  systemInstructions?: unknown;
}

function normalizeSystemInstructions(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, MAX_SYSTEM_INSTRUCTIONS);
}

export async function POST(request: NextRequest) {
  let body: RefineRequestBody;
  try {
    body = (await request.json()) as RefineRequestBody;
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INVALID_REQUEST,
      400,
      'Request body must be valid JSON',
      error instanceof Error ? error.message : String(error),
    );
  }

  const formState = normalizeFormState(body.formState);
  if (!formState) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid formState payload');
  }

  const messages = normalizeMessages(body.messages);
  if (!messages || messages.length === 0) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'messages is required');
  }
  const lastMessage = messages[messages.length - 1];
  if (lastMessage.role !== 'user') {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'last message must come from user');
  }

  const baseRequirement =
    typeof body.baseRequirement === 'string'
      ? body.baseRequirement.slice(0, MAX_REQUIREMENT_LENGTH)
      : '';

  const systemInstructions = normalizeSystemInstructions(body.systemInstructions);

  let resolved;
  try {
    resolved = await resolveModelFromRequest(request, body);
  } catch (error) {
    log.error('Failed to resolve model for teacher refine:', error);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to resolve model',
      error instanceof Error ? error.message : String(error),
    );
  }

  const { model: languageModel, modelInfo, thinkingConfig } = resolved;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
      const send = (event: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      const startHeartbeat = () => {
        stopHeartbeat();
        heartbeatTimer = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`:heartbeat\n\n`));
          } catch {
            stopHeartbeat();
          }
        }, HEARTBEAT_INTERVAL_MS);
      };
      const stopHeartbeat = () => {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
      };

      try {
        startHeartbeat();
        send({ type: 'start' });

        const result = streamLLM(
          {
            model: languageModel,
            system: buildSystemPrompt(systemInstructions),
            prompt: buildUserPrompt({ formState, baseRequirement, messages }),
            maxOutputTokens: modelInfo?.outputWindow,
            tools: buildRefineTools(),
          },
          'teacher-project-refine',
          thinkingConfig,
        );

        for await (const part of result.fullStream) {
          if (part.type === 'text-delta') {
            if (part.text) send({ type: 'reply-delta', delta: part.text });
          } else if (part.type === 'reasoning-delta') {
            if (part.text) send({ type: 'reasoning-delta', delta: part.text });
          } else if (part.type === 'tool-call') {
            send({
              type: 'tool-call',
              toolName: part.toolName as string,
              input: part.input,
            });
          } else if (part.type === 'error') {
            const message = part.error instanceof Error ? part.error.message : String(part.error);
            log.warn('Stream error chunk:', message);
            send({ type: 'error', error: message });
          }
        }

        send({ type: 'done' });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error('Teacher refine stream failed:', error);
        send({ type: 'error', error: message });
      } finally {
        stopHeartbeat();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

function buildRefineTools() {
  return {
    update_overview: tool({
      description:
        'Replace the entire course overview shown in the workbench. Use whenever you redraft the course summary. The overview should be a coherent paragraph (1-3 short paragraphs total).',
      inputSchema: z.object({
        overview: z.string().min(1).max(MAX_OVERVIEW_LENGTH),
      }),
    }),
    add_chapter: tool({
      description:
        'Append a new chapter (or insert after a given chapterId). Provide title, learningObjectives (1-6 short bullet strings), and summary (1-2 sentence chapter synopsis). Do NOT include an id field — the client allocates a temporary id.',
      inputSchema: z.object({
        afterChapterId: z.string().optional(),
        title: z.string().min(1).max(MAX_TITLE_LENGTH),
        learningObjectives: z
          .array(z.string().min(1).max(MAX_OBJECTIVE_LENGTH))
          .max(MAX_OBJECTIVES_PER_CHAPTER),
        summary: z.string().max(MAX_SUMMARY_LENGTH),
      }),
    }),
    update_chapter: tool({
      description:
        'Patch an existing chapter by chapterId. Only include fields you want to change in the patch object.',
      inputSchema: z.object({
        chapterId: z.string().min(1),
        patch: z
          .object({
            title: z.string().min(1).max(MAX_TITLE_LENGTH).optional(),
            learningObjectives: z
              .array(z.string().min(1).max(MAX_OBJECTIVE_LENGTH))
              .max(MAX_OBJECTIVES_PER_CHAPTER)
              .optional(),
            summary: z.string().max(MAX_SUMMARY_LENGTH).optional(),
          })
          .refine((value) => Object.keys(value).length > 0, {
            message: 'patch must have at least one field',
          }),
      }),
    }),
    remove_chapter: tool({
      description: 'Delete a chapter from the course outline by chapterId.',
      inputSchema: z.object({
        chapterId: z.string().min(1),
      }),
    }),
    reorder_chapters: tool({
      description:
        'Reorder all chapters. The order array MUST contain every existing chapterId exactly once.',
      inputSchema: z.object({
        order: z.array(z.string().min(1)).min(1).max(MAX_CHAPTERS),
      }),
    }),
  };
}

function buildSystemPrompt(teacherInstructions?: string): string {
  const base = [
    'You are an instructional design assistant working with a teacher in a real-time course design workbench.',
    'The workbench has TWO editable areas:',
    '  1. Course overview — a paragraph that frames the entire course (you manage via update_overview).',
    '  2. Chapter list — an ordered array of chapters; each chapter has { title, learningObjectives, summary }.',
    '',
    'Tools available (each call instantly applies to the workbench, no confirmation needed):',
    '  - update_overview({ overview })',
    '  - add_chapter({ afterChapterId?, title, learningObjectives, summary })  // do NOT include an id field',
    '  - update_chapter({ chapterId, patch: { title?, learningObjectives?, summary? } })',
    '  - remove_chapter({ chapterId })',
    '  - reorder_chapters({ order })',
    '',
    'Behavior:',
    '- Reply naturally in the same language the teacher uses, in 1-3 sentences explaining what you propose. Never paste field values verbatim into the reply text.',
    "- Bootstrap mode (overview is empty AND there are no chapters): you MUST call update_overview ONCE and at least 3 add_chapter calls to seed a meaningful course. The teacher's first message is the raw design intent.",
    '- Follow-up mode (overview already populated or chapters already exist): only modify what the teacher explicitly asks for. Do not re-order or re-write unrelated chapters.',
    '- DO NOT add_chapter and then update_chapter / remove_chapter the same new chapter in the same turn — you cannot reference its id; let the teacher follow up if needed.',
    '- Treat chapterId values as opaque strings. They appear in the user prompt rendering as `[id=xxxxx]` next to each chapter title.',
  ].join('\n');

  const trimmed = teacherInstructions?.trim();
  if (!trimmed) return base;
  return `${base}\n\n---\nAdditional instructions from the teacher (design agent profile). Follow them when they do not conflict with safety or the tool rules above:\n${trimmed}`;
}

function buildUserPrompt(input: {
  formState: FormStatePayload;
  baseRequirement: string;
  messages: ChatMessage[];
}): string {
  const transcript = input.messages
    .map((message) => `${message.role === 'user' ? 'Teacher' : 'Assistant'}: ${message.content}`)
    .join('\n');

  const sections: string[] = [];
  sections.push('Current course overview:');
  sections.push(input.formState.overview ? input.formState.overview : '(empty)');
  sections.push('');
  sections.push(`Current chapters (${input.formState.chapters.length}):`);
  if (input.formState.chapters.length === 0) {
    sections.push('(none)');
  } else {
    input.formState.chapters.forEach((chapter, index) => {
      sections.push(`  ${index + 1}. [id=${chapter.id}] ${chapter.title}`);
      if (chapter.summary) sections.push(`     summary: ${chapter.summary}`);
      if (chapter.learningObjectives.length > 0) {
        for (const objective of chapter.learningObjectives) {
          sections.push(`     - ${objective}`);
        }
      }
    });
  }

  if (input.baseRequirement) {
    sections.push('', 'Original homepage requirement (anchor):', input.baseRequirement);
  }

  sections.push('', 'Conversation so far:', transcript);

  if (isFreshWorkbench(input.formState)) {
    sections.push('', buildBootstrapDirective());
  }

  return sections.join('\n');
}

function isFreshWorkbench(formState: FormStatePayload): boolean {
  return formState.overview.trim() === '' && formState.chapters.length === 0;
}

function buildBootstrapDirective(): string {
  return [
    'Bootstrap mode (the workbench has no overview and no chapters yet):',
    "- Treat the teacher's latest message as the raw course design intent.",
    '- You MUST call update_overview ONCE and at least 3 add_chapter calls to seed a meaningful course. Emit values via tool calls so the workbench fills in instantly.',
    '- After the tool calls, write a 1-2 sentence reply explaining your design rationale.',
  ].join('\n');
}

function normalizeFormState(value: unknown): FormStatePayload | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.overview !== 'string') return null;
  if (!Array.isArray(candidate.chapters)) return null;
  const chapters: ChapterSnapshot[] = [];
  for (const entry of candidate.chapters.slice(0, MAX_CHAPTERS)) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== 'string' || typeof e.title !== 'string') continue;
    if (!Array.isArray(e.learningObjectives)) continue;
    chapters.push({
      id: e.id,
      title: e.title.slice(0, MAX_TITLE_LENGTH),
      learningObjectives: (e.learningObjectives as unknown[])
        .filter((line): line is string => typeof line === 'string')
        .map((line) => line.slice(0, MAX_OBJECTIVE_LENGTH))
        .slice(0, MAX_OBJECTIVES_PER_CHAPTER),
      summary: typeof e.summary === 'string' ? e.summary.slice(0, MAX_SUMMARY_LENGTH) : '',
    });
  }
  return {
    overview: candidate.overview.slice(0, MAX_OVERVIEW_LENGTH),
    chapters,
  };
}

function normalizeMessages(value: unknown): ChatMessage[] | null {
  if (!Array.isArray(value)) return null;
  const trimmed = value.slice(-MAX_MESSAGES);
  const messages: ChatMessage[] = [];
  for (const entry of trimmed) {
    if (typeof entry !== 'object' || entry === null) continue;
    const candidate = entry as Partial<ChatMessage>;
    if (
      (candidate.role !== 'user' && candidate.role !== 'assistant') ||
      typeof candidate.content !== 'string'
    ) {
      continue;
    }
    const content = candidate.content.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!content) continue;
    messages.push({ role: candidate.role, content });
  }
  return messages;
}

/**
 * @extends-from app/api/extends/teacher/assist/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { type NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { createLogger } from '@/lib/logger';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';

const log = createLogger('Teacher Assist API');

const scopes = ['outline', 'chapter', 'slide', 'quiz'] as const;
type TeacherAssistScope = (typeof scopes)[number];
const MAX_INSTRUCTION_LENGTH = 2000;
const MAX_CONTEXT_LENGTH = 4000;
const CONTEXT_TRUNCATED_MARKER = '\n[Context truncated]';
const CONTEXT_UNAVAILABLE = '[Context unavailable: could not serialize safely]';

type TeacherAssistRequest = {
  scope?: unknown;
  instruction?: unknown;
  context?: unknown;
};

export const maxDuration = 120;

function isTeacherAssistScope(value: unknown): value is TeacherAssistScope {
  return typeof value === 'string' && scopes.includes(value as TeacherAssistScope);
}

function formatContext(context: unknown): string {
  if (context === undefined || context === null) {
    return 'No additional context was provided.';
  }

  try {
    const serialized = JSON.stringify(context, null, 2);
    if (!serialized) {
      return CONTEXT_UNAVAILABLE;
    }

    if (serialized.length > MAX_CONTEXT_LENGTH) {
      return `${serialized.slice(0, MAX_CONTEXT_LENGTH)}${CONTEXT_TRUNCATED_MARKER}`;
    }

    return serialized;
  } catch {
    return CONTEXT_UNAVAILABLE;
  }
}

function buildTeacherAssistPrompt(
  scope: TeacherAssistScope,
  instruction: string,
  context: unknown,
): string {
  return [
    `Assist scope: ${scope}`,
    `Teacher instruction: ${instruction}`,
    'Context:',
    formatContext(context),
    '',
    'Return only the suggestion text. Do not modify files, course data, or project state.',
  ].join('\n');
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as TeacherAssistRequest;

    if (!isTeacherAssistScope(body.scope)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid teacher assist scope');
    }

    const instruction = typeof body.instruction === 'string' ? body.instruction.trim() : '';
    if (!instruction) {
      return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'instruction is required');
    }
    if (instruction.length > MAX_INSTRUCTION_LENGTH) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'instruction is too long');
    }

    const {
      model: languageModel,
      modelInfo,
      thinkingConfig,
    } = await resolveModelFromRequest(request, body);
    const result = await callLLM(
      {
        model: languageModel,
        system:
          'You are a teacher assistant for OpenMAIC. Provide concise, actionable suggestions only. Never claim to apply changes or write directly into course content.',
        prompt: buildTeacherAssistPrompt(body.scope, instruction, body.context),
        maxOutputTokens: modelInfo?.outputWindow,
      },
      'teacher-assist',
      undefined,
      thinkingConfig,
    );

    return apiSuccess({ suggestion: result.text });
  } catch (error) {
    log.error('Teacher assist route failed:', error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to generate teacher assistance');
  }
}

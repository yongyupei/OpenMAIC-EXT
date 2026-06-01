/**
 * @extends-from app/api/extends/teacher/prompts/[promptId]/default/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import { isAllowedGenerationPromptId } from '@/lib/prompts/generation-prompt-allowlist';
import { loadPrompt } from '@/lib/prompts/loader';
import type { PromptId } from '@/lib/prompts/types';

type RouteContext = {
  params: Promise<{ promptId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { promptId } = await context.params;

  if (!isAllowedGenerationPromptId(promptId)) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Prompt is not editable');
  }

  const loaded = loadPrompt(promptId as PromptId);
  if (!loaded) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Prompt template not found');
  }

  return apiSuccess({
    promptId,
    system: loaded.systemPrompt,
    user: loaded.userPromptTemplate,
    readOnly: true,
  });
}

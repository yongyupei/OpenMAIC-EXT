/**
 * @extends-from tests/teacher/assist-api.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { POST } from '@app-extends/api/teacher/assist/route';
import { callLLM } from '@/lib/ai/llm';

vi.mock('@/lib/ai/llm', () => ({
  callLLM: vi.fn(async () => ({ text: 'Try adding a formative check after the example.' })),
}));

vi.mock('@/lib/server/resolve-model', () => ({
  resolveModelFromRequest: vi.fn(async () => ({
    model: 'mock-model',
    modelInfo: { outputWindow: 4096 },
    modelString: 'mock-provider/mock-model',
    thinkingConfig: { mode: 'disabled', enabled: false },
  })),
}));

function createRequest(body: unknown): Request {
  return new Request('http://localhost/api/extends/teacher/assist', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('teacher assist API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('rejects unknown assist scope', async () => {
    const response = await POST(
      createRequest({ scope: 'unknown', instruction: 'Improve this' }) as never,
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.errorCode).toBe('INVALID_REQUEST');
    expect(callLLM).not.toHaveBeenCalled();
  });

  test('rejects missing instruction', async () => {
    const response = await POST(createRequest({ scope: 'outline', instruction: '   ' }) as never);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.errorCode).toBe('MISSING_REQUIRED_FIELD');
    expect(callLLM).not.toHaveBeenCalled();
  });

  test('rejects overlong instruction', async () => {
    const response = await POST(
      createRequest({ scope: 'outline', instruction: 'x'.repeat(2001) }) as never,
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.errorCode).toBe('INVALID_REQUEST');
    expect(callLLM).not.toHaveBeenCalled();
  });

  test('returns an LLM suggestion', async () => {
    const response = await POST(
      createRequest({
        scope: 'quiz',
        instruction: 'Improve the distractors',
        context: { question: 'What is force?' },
      }) as never,
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      success: true,
      suggestion: 'Try adding a formative check after the example.',
    });
    expect(callLLM).toHaveBeenCalledWith(
      {
        model: 'mock-model',
        system: expect.stringContaining('teacher assistant'),
        prompt: expect.stringContaining('Improve the distractors'),
        maxOutputTokens: 4096,
      },
      'teacher-assist',
      undefined,
      { mode: 'disabled', enabled: false },
    );
  });

  test('truncates overlong context before sending prompt to LLM', async () => {
    const response = await POST(
      createRequest({
        scope: 'chapter',
        instruction: 'Make the examples more practical',
        context: {
          content: `${'context '.repeat(900)}SECRET_AT_END`,
        },
      }) as never,
    );
    const prompt = vi.mocked(callLLM).mock.calls[0]?.[0].prompt;

    expect(response.status).toBe(200);
    expect(prompt).toContain('[Context truncated]');
    expect(prompt).not.toContain('SECRET_AT_END');
  });

  test('does not expose secret LLM errors', async () => {
    vi.mocked(callLLM).mockRejectedValueOnce(new Error('SECRET_PROVIDER_TOKEN'));

    const response = await POST(
      createRequest({ scope: 'slide', instruction: 'Make this clearer' }) as never,
    );
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.errorCode).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(json)).not.toContain('SECRET_PROVIDER_TOKEN');
  });
});

import { nanoid } from 'nanoid';

import { buildPrompt, PROMPT_IDS } from '@/lib/prompts';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import type { GeneratedQuizContent, SceneOutline } from '@/lib/types/generation';
import type { QuizQuestion } from '@/lib/types/stage';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import { createLogger } from '@/lib/logger';

import { CONTENT_GENERATION_MAX_ATTEMPTS } from './scene-generator-constants';
import { buildQuizContentFallback } from './scene-generator-fallbacks';

const log = createLogger('Generation');

export async function generateQuizContent(
  outline: SceneOutline,
  aiCall: AICallFn,
  languageDirective?: string,
  chapterDesignBrief?: string,
  researchContext?: string,
): Promise<GeneratedQuizContent> {
  const quizConfig = outline.quizConfig || {
    questionCount: 3,
    difficulty: 'medium',
    questionTypes: ['single'],
  };

  const prompts = buildPrompt(PROMPT_IDS.QUIZ_CONTENT, {
    title: outline.title,
    description: outline.description,
    keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
    questionCount: quizConfig.questionCount,
    difficulty: quizConfig.difficulty,
    questionTypes: quizConfig.questionTypes.join(', '),
    chapterDesignBrief: chapterDesignBrief || '',
    researchContext: researchContext?.trim() ?? '',
    languageDirective: languageDirective || '',
  });

  if (!prompts) {
    log.error(`Failed to build quiz prompt for: ${outline.title}`);
    return buildQuizContentFallback(outline);
  }

  log.debug(`Generating quiz content for: ${outline.title}`);

  for (let attempt = 1; attempt <= CONTENT_GENERATION_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await aiCall(prompts.system, prompts.user);
      const generatedQuestions = parseJsonResponse<QuizQuestion[]>(response);

      if (
        !generatedQuestions ||
        !Array.isArray(generatedQuestions) ||
        generatedQuestions.length === 0
      ) {
        log.warn(
          `Failed to parse quiz JSON for "${outline.title}" (attempt ${attempt}/${CONTENT_GENERATION_MAX_ATTEMPTS})`,
        );
        continue;
      }

      log.debug(`Got ${generatedQuestions.length} questions for: ${outline.title}`);

      const questions: QuizQuestion[] = generatedQuestions.map((q) => {
        const isText = q.type === 'short_answer';
        return {
          ...q,
          id: q.id || `q_${nanoid(8)}`,
          options: isText ? undefined : normalizeQuizOptions(q.options),
          answer: isText ? undefined : normalizeQuizAnswer(q as unknown as Record<string, unknown>),
          hasAnswer: isText ? false : true,
        };
      });

      return { questions };
    } catch (error) {
      log.warn(
        `Quiz AI call failed for "${outline.title}" (attempt ${attempt}/${CONTENT_GENERATION_MAX_ATTEMPTS}):`,
        error,
      );
    }
  }

  log.warn(`Using quiz content fallback for: ${outline.title}`);
  return buildQuizContentFallback(outline);
}

/**
 * Normalize quiz options from AI response.
 * AI may generate plain strings ["OptionA", "OptionB"] or QuizOption objects.
 * This normalizes to QuizOption[] format: { value: "A", label: "OptionA" }
 */
function normalizeQuizOptions(
  options: unknown[] | undefined,
): { value: string; label: string }[] | undefined {
  if (!options || !Array.isArray(options)) return undefined;

  return options.map((opt, index) => {
    const letter = String.fromCharCode(65 + index); // A, B, C, D...

    if (typeof opt === 'string') {
      return { value: letter, label: opt };
    }

    if (typeof opt === 'object' && opt !== null) {
      const obj = opt as Record<string, unknown>;
      return {
        value: typeof obj.value === 'string' ? obj.value : letter,
        label: typeof obj.label === 'string' ? obj.label : String(obj.value || obj.text || letter),
      };
    }

    return { value: letter, label: String(opt) };
  });
}

/**
 * Normalize quiz answer from AI response.
 * AI may generate correctAnswer as string or string[], under various field names.
 * This normalizes to string[] format matching option values.
 */
function normalizeQuizAnswer(question: Record<string, unknown>): string[] | undefined {
  // AI might use "correctAnswer", "answer", or "correct_answer"
  const raw =
    question.answer ??
    question.correctAnswer ??
    (question as Record<string, unknown>).correct_answer;
  if (!raw) return undefined;

  if (Array.isArray(raw)) {
    return raw.map(String);
  }
  return [String(raw)];
}

/**
 * @extends-from tests/teacher/preview-api.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, test } from 'vitest';
import { buildChapterStructureText } from '@/lib/teacher/preview-helpers';
import type { ChapterHint } from '@/lib/teacher/preview-helpers';

describe('buildChapterStructureText injection behaviour', () => {
  const makeHint = (overrides: Partial<ChapterHint> = {}): ChapterHint => ({
    title: '变量与数据类型',
    learningObjectives: ['理解变量声明', '掌握基本类型'],
    targetSceneCount: 3,
    ...overrides,
  });

  test('non-empty presetChapters → system prompt contains chapter structure', () => {
    const hints = [makeHint()];
    const chapterText = buildChapterStructureText(hints);

    const baseSystemPrompt = '你是一个课程生成助手。';
    const systemPrompt = chapterText ? `${baseSystemPrompt}\n\n${chapterText}` : baseSystemPrompt;

    expect(systemPrompt).toContain(baseSystemPrompt);
    expect(systemPrompt).toContain('变量与数据类型');
    expect(systemPrompt).toContain('理解变量声明');
    expect(systemPrompt).toContain('期望场景数：3');
  });

  test('empty presetChapters → system prompt unchanged', () => {
    const chapterText = buildChapterStructureText([]);
    const baseSystemPrompt = '你是一个课程生成助手。';
    const systemPrompt = chapterText ? `${baseSystemPrompt}\n\n${chapterText}` : baseSystemPrompt;

    expect(systemPrompt).toBe(baseSystemPrompt);
  });

  test('multiple chapters → all chapter titles appear in structure', () => {
    const hints = [makeHint({ title: '第一章：引论' }), makeHint({ title: '第二章：进阶' })];
    const text = buildChapterStructureText(hints);
    expect(text).toContain('第一章：引论');
    expect(text).toContain('第二章：进阶');
  });
});

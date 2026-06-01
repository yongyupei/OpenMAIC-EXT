/**
 * @extends-from tests/generation/scene-content-fallback.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, it } from 'vitest';

import { generateSceneContent } from '@/lib/generation/scene-generator';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import type {
  SceneOutline,
  GeneratedSlideContent,
  GeneratedQuizContent,
} from '@/lib/types/generation';

function baseOutline(overrides: Partial<SceneOutline> = {}): SceneOutline {
  return {
    id: 'scene_11',
    type: 'slide',
    title: 'Late Scene',
    description: 'Scene eleven content.',
    keyPoints: ['Concept A', 'Concept B'],
    order: 10,
    ...overrides,
  };
}

describe('scene content fallbacks', () => {
  it('returns outline-based slide when LLM JSON is invalid', async () => {
    const aiCall: AICallFn = async () => 'not valid json {{{';
    const content = (await generateSceneContent(
      baseOutline(),
      aiCall,
      {},
    )) as GeneratedSlideContent;

    expect(content.elements.length).toBeGreaterThan(0);
    expect(content.elements.some((el) => el.type === 'text')).toBe(true);
    expect(content.remark).toBe('Scene eleven content.');
  });

  it('returns outline-based slide when LLM returns empty elements', async () => {
    const aiCall: AICallFn = async () => JSON.stringify({ elements: [], remark: '' });
    const content = (await generateSceneContent(
      baseOutline(),
      aiCall,
      {},
    )) as GeneratedSlideContent;

    expect(content.elements.length).toBeGreaterThan(0);
  });

  it('retries slide generation once before falling back', async () => {
    let calls = 0;
    const aiCall: AICallFn = async () => {
      calls += 1;
      if (calls === 1) return 'broken';
      return JSON.stringify({
        elements: [
          {
            type: 'text',
            left: 100,
            top: 100,
            width: 400,
            height: 80,
            content: '<p>Recovered</p>',
          },
        ],
      });
    };

    const content = (await generateSceneContent(
      baseOutline(),
      aiCall,
      {},
    )) as GeneratedSlideContent;

    expect(calls).toBe(2);
    expect(content.elements.some((el) => el.type === 'text')).toBe(true);
  });

  it('returns outline-based quiz when LLM JSON is invalid', async () => {
    const aiCall: AICallFn = async () => '{bad quiz json';
    const content = (await generateSceneContent(
      baseOutline({
        type: 'quiz',
        quizConfig: { questionCount: 2, difficulty: 'medium', questionTypes: ['single'] },
      }),
      aiCall,
      {},
    )) as GeneratedQuizContent;

    expect(content.questions.length).toBeGreaterThan(0);
    expect(content.questions[0]?.answer).toEqual(['A']);
  });

  it('treats unknown scene types as slides', async () => {
    const aiCall: AICallFn = async () => 'not json';
    const content = await generateSceneContent(
      baseOutline({ type: 'unknown' as SceneOutline['type'] }),
      aiCall,
      {},
    );

    expect(content).not.toBeNull();
    expect((content as GeneratedSlideContent).elements.length).toBeGreaterThan(0);
  });
});

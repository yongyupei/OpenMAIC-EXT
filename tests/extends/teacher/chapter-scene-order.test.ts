/**
 * @extends-from tests/teacher/chapter-scene-order.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, test } from 'vitest';
import type { CourseEditorChapterNavModel } from '@/lib/teacher/chapter-scene-order';
import { resolveChapterTargetSceneId } from '@/lib/teacher/chapter-scene-order';

const nav: CourseEditorChapterNavModel = {
  chapters: [
    { id: 'ch1', title: 'Chapter 1' },
    { id: 'ch2', title: 'Chapter 2' },
    { id: 'ch3', title: 'Chapter 3' },
  ],
  sceneIdsByChapterId: {
    ch1: ['s1', 's2'],
    ch2: ['s3', 's4'],
    ch3: ['s5'],
  },
};

const sortedScenes = [{ id: 's1' }, { id: 's2' }, { id: 's3' }, { id: 's4' }, { id: 's5' }];

describe('resolveChapterTargetSceneId', () => {
  test('返回章节的第一个有效 scene ID（主路径）', () => {
    const available = new Set(['s1', 's2', 's3', 's4', 's5']);
    expect(resolveChapterTargetSceneId(nav, 'ch2', available, sortedScenes)).toBe('s3');
  });

  test('跳过不在 store 中的 artifact sceneId，返回第一个有效的', () => {
    // s3 已过期，s4 存在
    const available = new Set(['s1', 's2', 's4', 's5']);
    expect(resolveChapterTargetSceneId(nav, 'ch2', available, sortedScenes)).toBe('s4');
  });

  test('主路径全部失效时走 fallback 按索引估算', () => {
    // ch2 的 artifact IDs 全部失效
    const available = new Set(['s1', 's2', 's5']);
    const result = resolveChapterTargetSceneId(nav, 'ch2', available, sortedScenes);
    // fallback: chapterIndex=1, scenesPerChapter=ceil(5/3)=2, estimatedIdx=2 → sortedScenes[2].id='s3'
    expect(result).toBe('s3');
  });

  test('章节 ID 不存在时返回 null', () => {
    const available = new Set(['s1']);
    expect(resolveChapterTargetSceneId(nav, 'ch999', available, sortedScenes)).toBeNull();
  });

  test('sortedScenes 为空时返回 null', () => {
    const available = new Set<string>();
    expect(resolveChapterTargetSceneId(nav, 'ch1', available, [])).toBeNull();
  });

  test('返回第一个章节（ch1）第一个有效 scene', () => {
    const available = new Set(['s1', 's2', 's3', 's4', 's5']);
    expect(resolveChapterTargetSceneId(nav, 'ch1', available, sortedScenes)).toBe('s1');
  });
});

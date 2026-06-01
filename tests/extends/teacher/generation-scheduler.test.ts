/**
 * @extends-from tests/teacher/generation-scheduler.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, test } from 'vitest';
import { runGenerationScheduler, type ChapterStepStatus } from '@/lib/teacher/generation-scheduler';

describe('generation-scheduler', () => {
  test('runs outline + scenes for each chapter sequentially', async () => {
    const log: string[] = [];
    const result = await runGenerationScheduler({
      chapters: [
        { id: 'c1', title: 'A' },
        { id: 'c2', title: 'B' },
      ],
      generateOutline: async (chapterId) => {
        log.push(`outline:${chapterId}`);
        return { ok: true };
      },
      generateScenes: async (chapterId) => {
        log.push(`scenes:${chapterId}`);
        return { ok: true };
      },
      publish: async () => {
        log.push('publish');
        return { ok: true, classroomId: 'cls-1' };
      },
      onChapterStatus: () => {},
    });
    expect(log).toEqual(['outline:c1', 'scenes:c1', 'outline:c2', 'scenes:c2', 'publish']);
    expect(result.outcome).toBe('completed');
    expect(result.classroomId).toBe('cls-1');
  });

  test('reports per-chapter status updates', async () => {
    const updates: Array<{ chapterId: string; status: ChapterStepStatus }> = [];
    await runGenerationScheduler({
      chapters: [{ id: 'c1', title: 'A' }],
      generateOutline: async () => ({ ok: true }),
      generateScenes: async () => ({ ok: true }),
      publish: async () => ({ ok: true, classroomId: 'cls-1' }),
      onChapterStatus: (chapterId, status) => updates.push({ chapterId, status }),
    });
    expect(updates.map((entry) => entry.status)).toEqual(['outlining', 'generating', 'ready']);
  });

  test('stops on outline failure and reports failed outcome', async () => {
    const result = await runGenerationScheduler({
      chapters: [
        { id: 'c1', title: 'A' },
        { id: 'c2', title: 'B' },
      ],
      generateOutline: async (chapterId) =>
        chapterId === 'c1' ? { ok: false, error: 'boom' } : { ok: true },
      generateScenes: async () => ({ ok: true }),
      publish: async () => ({ ok: true, classroomId: 'x' }),
      onChapterStatus: () => {},
    });
    expect(result.outcome).toBe('failed');
    expect(result.failedChapterId).toBe('c1');
    expect(result.failedStep).toBe('outline');
  });

  test('honors abort signal between chapters', async () => {
    const abort = new AbortController();
    const result = await runGenerationScheduler({
      chapters: [
        { id: 'c1', title: 'A' },
        { id: 'c2', title: 'B' },
      ],
      generateOutline: async (chapterId) => {
        if (chapterId === 'c1') abort.abort();
        return { ok: true };
      },
      generateScenes: async () => ({ ok: true }),
      publish: async () => ({ ok: true, classroomId: 'x' }),
      onChapterStatus: () => {},
      signal: abort.signal,
    });
    expect(result.outcome).toBe('cancelled');
  });
});

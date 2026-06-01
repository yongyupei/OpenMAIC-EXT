/**
 * @extends-from lib/teacher/generation-scheduler.ts
 * @fork-branch feat/html-slide-design-workbench
 */
export type ChapterStepStatus = 'pending' | 'outlining' | 'generating' | 'ready' | 'failed';

export type StepResult = { ok: true } | { ok: false; error: string };
export type PublishResult = { ok: true; classroomId: string } | { ok: false; error: string };

export interface SchedulerChapterRef {
  id: string;
  title: string;
}

export interface SchedulerInput {
  chapters: SchedulerChapterRef[];
  generateOutline: (chapterId: string) => Promise<StepResult>;
  generateScenes: (chapterId: string) => Promise<StepResult>;
  publish: () => Promise<PublishResult>;
  onChapterStatus: (chapterId: string, status: ChapterStepStatus) => void;
  signal?: AbortSignal;
}

export type SchedulerOutcome = 'completed' | 'failed' | 'cancelled';

export interface SchedulerResult {
  outcome: SchedulerOutcome;
  classroomId?: string;
  failedChapterId?: string;
  failedStep?: 'outline' | 'scenes' | 'publish';
  error?: string;
}

export async function runGenerationScheduler(input: SchedulerInput): Promise<SchedulerResult> {
  for (const chapter of input.chapters) {
    if (input.signal?.aborted) return { outcome: 'cancelled' };

    input.onChapterStatus(chapter.id, 'outlining');
    const outlineResult = await input.generateOutline(chapter.id);
    if (input.signal?.aborted) return { outcome: 'cancelled' };
    if (!outlineResult.ok) {
      input.onChapterStatus(chapter.id, 'failed');
      return {
        outcome: 'failed',
        failedChapterId: chapter.id,
        failedStep: 'outline',
        error: outlineResult.error,
      };
    }

    input.onChapterStatus(chapter.id, 'generating');
    const scenesResult = await input.generateScenes(chapter.id);
    if (input.signal?.aborted) return { outcome: 'cancelled' };
    if (!scenesResult.ok) {
      input.onChapterStatus(chapter.id, 'failed');
      return {
        outcome: 'failed',
        failedChapterId: chapter.id,
        failedStep: 'scenes',
        error: scenesResult.error,
      };
    }

    input.onChapterStatus(chapter.id, 'ready');
  }

  if (input.signal?.aborted) return { outcome: 'cancelled' };
  const publishResult = await input.publish();
  if (!publishResult.ok) {
    return { outcome: 'failed', failedStep: 'publish', error: publishResult.error };
  }
  return { outcome: 'completed', classroomId: publishResult.classroomId };
}

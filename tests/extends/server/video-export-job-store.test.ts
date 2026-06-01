/**
 * @extends-from tests/server/video-export-job-store.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, test, vi } from 'vitest';

vi.mock('fs', () => ({
  promises: {
    mkdir: vi.fn(async () => undefined),
    writeFile: vi.fn(async () => undefined),
    rename: vi.fn(async () => undefined),
    readFile: vi.fn(async () =>
      JSON.stringify({
        id: 'video-job-1',
        classroomId: 'course-1',
        status: 'queued',
        step: 'queued',
        progress: 0,
        message: 'Video export job queued',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    ),
  },
}));

import {
  createVideoExportJob,
  markVideoExportJobSucceeded,
} from '@/lib/server/video-export-job-store';

describe('video export job store', () => {
  test('creates a queued video export job for a classroom', async () => {
    const job = await createVideoExportJob('video-job-1', {
      classroomId: 'course-1',
      strategy: 'static',
    });

    expect(job).toMatchObject({
      id: 'video-job-1',
      classroomId: 'course-1',
      status: 'queued',
      progress: 0,
      step: 'queued',
    });
  });

  test('records the published artifact when the export succeeds', async () => {
    const job = await markVideoExportJobSucceeded('video-job-1', {
      videoUrl: 'http://localhost:3000/api/extends/export-video/video-job-1/video',
      videoPath: 'data/video-exports/video-job-1/video-job-1.mp4',
      durationSeconds: 42,
      width: 1920,
      height: 1080,
      format: 'mp4',
    });

    expect(job).toMatchObject({
      status: 'succeeded',
      step: 'completed',
      progress: 100,
      artifact: {
        videoUrl: 'http://localhost:3000/api/extends/export-video/video-job-1/video',
        durationSeconds: 42,
        format: 'mp4',
      },
    });
  });
});

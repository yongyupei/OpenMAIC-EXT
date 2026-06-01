/**
 * @extends-from tests/teacher/video-export-client.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createVideoExportDraft,
  fetchVideoExportJob,
  waitForVideoExportJob,
} from '@/lib/teacher/video-export-client';

describe('video-export-client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a video export draft job', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 202,
        json: async () => ({
          success: true,
          jobId: 'job-1',
          pollUrl: '/api/extends/export-video/job-1',
        }),
      }),
    );

    const result = await createVideoExportDraft('classroom-1');
    expect(result).toEqual({
      ok: true,
      jobId: 'job-1',
      pollUrl: '/api/extends/export-video/job-1',
    });
  });

  it('polls until the job succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          job: {
            id: 'job-1',
            status: 'running',
            step: 'rendering',
            progress: 40,
            message: 'Rendering',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          job: {
            id: 'job-1',
            status: 'succeeded',
            step: 'completed',
            progress: 100,
            message: 'Done',
            artifact: { videoUrl: '/api/extends/export-video/job-1/video', durationSeconds: 42 },
          },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const updates: string[] = [];
    const finalJob = await waitForVideoExportJob('job-1', {
      intervalMs: 1,
      onUpdate: (job) => updates.push(job.status),
    });

    expect(finalJob.status).toBe('succeeded');
    expect(updates).toEqual(['running', 'succeeded']);
  });

  it('returns null when the job cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ success: false }),
      }),
    );

    await expect(fetchVideoExportJob('missing')).resolves.toBeNull();
  });
});

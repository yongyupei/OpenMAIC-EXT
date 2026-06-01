/**
 * @extends-from tests/server/video-export-ffmpeg.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { probeAudioDurationMs } from '@/lib/server/video-export/ffmpeg';

const execFileMock = vi.fn();

vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => execFileMock(...args),
}));

describe('ffmpeg helpers', () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  it('parses ffprobe duration seconds to milliseconds', async () => {
    execFileMock.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        cb: (err: null, out: { stdout: string }) => void,
      ) => {
        cb(null, { stdout: '3.200000\n' });
      },
    );

    const ms = await probeAudioDurationMs('/tmp/a.mp3');
    expect(ms).toBe(3200);
    expect(execFileMock).toHaveBeenCalled();
  });

  it('rejects when ffprobe fails', async () => {
    execFileMock.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: (err: Error) => void) => {
        cb(new Error('ffprobe not found'));
      },
    );

    await expect(probeAudioDurationMs('/tmp/missing.mp3')).rejects.toThrow('ffprobe not found');
  });
});

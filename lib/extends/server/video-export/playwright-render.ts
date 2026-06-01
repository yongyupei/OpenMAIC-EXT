/**
 * @extends-from lib/server/video-export/playwright-render.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { mkdir } from 'fs/promises';
import path from 'path';
import type { VideoTimelineSegment } from '@/lib/server/video-export/timeline';
import { signExportRenderToken } from '@/lib/server/video-export/render-token';

async function loadChromium() {
  const playwrightTest = await import('@playwright/test');
  return playwrightTest.chromium;
}

export async function captureSceneFrames(options: {
  baseUrl: string;
  jobId: string;
  classroomId: string;
  segments: VideoTimelineSegment[];
  framesDir: string;
}): Promise<Map<string, string>> {
  await mkdir(options.framesDir, { recursive: true });

  const uniqueSceneIds = [...new Set(options.segments.map((segment) => segment.sceneId))];
  const framePaths = new Map<string, string>();
  if (uniqueSceneIds.length === 0) {
    return framePaths;
  }

  const chromium = await loadChromium();
  const browser = await chromium.launch({ headless: true });
  const token = signExportRenderToken(options.jobId, options.classroomId);

  try {
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
    });

    for (const sceneId of uniqueSceneIds) {
      const url = new URL(`/export-video/render/${options.jobId}`, options.baseUrl);
      url.searchParams.set('token', token);
      url.searchParams.set('sceneId', sceneId);

      await page.goto(url.toString(), { waitUntil: 'networkidle', timeout: 120_000 });
      await page.waitForFunction(() => window.__exportVideoReady === true, undefined, {
        timeout: 60_000,
      });

      const framePath = path.join(options.framesDir, `${sceneId}.png`);
      const root = page.locator('#export-video-root');
      await root.screenshot({ path: framePath, type: 'png' });
      framePaths.set(sceneId, framePath);
    }
  } finally {
    await browser.close();
  }

  return framePaths;
}

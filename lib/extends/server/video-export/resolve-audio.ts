/**
 * @extends-from lib/server/video-export/resolve-audio.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';

export async function resolveAudioUrlToLocalFile(
  audioUrl: string,
  cacheDir: string,
): Promise<string> {
  await mkdir(cacheDir, { recursive: true });
  const hash = createHash('sha256').update(audioUrl).digest('hex').slice(0, 16);
  const extension = path.extname(new URL(audioUrl, 'http://localhost').pathname) || '.mp3';
  const targetPath = path.join(cacheDir, `${hash}${extension}`);

  const response = await fetch(audioUrl);
  if (!response.ok) {
    throw new Error(`Failed to download audio: ${audioUrl} (${response.status})`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(targetPath, buffer);
  return targetPath;
}

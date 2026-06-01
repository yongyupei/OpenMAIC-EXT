/**
 * @extends-from lib/server/video-export/extract-assets.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { promises as fs } from 'fs';
import path from 'path';

export async function extractExportAssetsZip(zipBuffer: Buffer, workDir: string): Promise<void> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(zipBuffer);
  const audioDir = path.join(workDir, 'audio');
  await fs.mkdir(audioDir, { recursive: true });

  const entries = Object.values(zip.files);
  for (const entry of entries) {
    if (entry.dir) continue;
    const normalized = entry.name.replace(/\\/g, '/');
    if (!normalized.startsWith('audio/')) continue;
    const fileName = path.basename(normalized);
    if (!fileName) continue;
    const buffer = await entry.async('nodebuffer');
    await fs.writeFile(path.join(audioDir, fileName), buffer);
  }
}

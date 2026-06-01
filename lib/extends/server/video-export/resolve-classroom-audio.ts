/**
 * @extends-from lib/server/video-export/resolve-classroom-audio.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { access } from 'fs/promises';
import path from 'path';
import { CLASSROOMS_DIR } from '@/lib/server/classroom-storage';
import { resolveAudioUrlToLocalFile } from '@/lib/server/video-export/resolve-audio';

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function resolveSpeechAudioPath(options: {
  audioUrl: string;
  classroomId: string;
  baseUrl: string;
  cacheDir: string;
}): Promise<string | undefined> {
  const absolute = options.audioUrl.startsWith('http')
    ? options.audioUrl
    : new URL(options.audioUrl, options.baseUrl).toString();

  const mediaMatch = absolute.match(/\/api\/classroom-media\/([^/]+)\/audio\/([^/?#]+)$/i);
  if (mediaMatch) {
    const [, classroomId, filename] = mediaMatch;
    const localPath = path.join(CLASSROOMS_DIR, classroomId, 'audio', filename);
    if (await fileExists(localPath)) {
      return localPath;
    }
  }

  try {
    return await resolveAudioUrlToLocalFile(absolute, options.cacheDir);
  } catch {
    return undefined;
  }
}

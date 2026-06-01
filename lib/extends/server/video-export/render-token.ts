/**
 * @extends-from lib/server/video-export/render-token.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { createHmac, timingSafeEqual } from 'crypto';

const TOKEN_TTL_MS = 15 * 60 * 1000;

function getSecret(): string {
  return (
    process.env.VIDEO_EXPORT_RENDER_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    'openmaic-video-export-dev-secret'
  );
}

export function signExportRenderToken(jobId: string, classroomId: string): string {
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const payload = `${jobId}:${classroomId}:${expiresAt}`;
  const signature = createHmac('sha256', getSecret()).update(payload).digest('base64url');
  return `${expiresAt}.${signature}`;
}

export function verifyExportRenderToken(
  token: string,
  jobId: string,
  classroomId: string,
): boolean {
  const [expiresRaw, signature] = token.split('.');
  if (!expiresRaw || !signature) return false;

  const expiresAt = Number.parseInt(expiresRaw, 10);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    return false;
  }

  const payload = `${jobId}:${classroomId}:${expiresAt}`;
  const expected = createHmac('sha256', getSecret()).update(payload).digest('base64url');

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

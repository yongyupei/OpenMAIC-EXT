/**
 * @extends-from lib/teacher/video-export-client.ts
 * @fork-branch feat/html-slide-design-workbench
 */
export interface VideoExportArtifactSnapshot {
  videoUrl: string;
  durationSeconds: number;
  width?: number;
  height?: number;
  format?: 'mp4';
  /** @deprecated Legacy render-plan artifact */
  artifactUrl?: string;
}

export interface VideoExportJobSnapshot {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  step: string;
  progress: number;
  message: string;
  artifact?: VideoExportArtifactSnapshot;
  error?: string;
}

export type CreateVideoExportResult =
  | { ok: true; jobId: string; pollUrl: string }
  | { ok: false; error: string };

export interface CreateVideoExportJobOptions {
  /** Client will upload an audio zip — defer job start until upload completes. */
  clientWillUploadAssets?: boolean;
  /** Missing client-side audio; rely on server-side TTS batch generation. */
  serverNarrationFallback?: boolean;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

function normalizeArtifact(
  artifact: Record<string, unknown> | undefined,
): VideoExportArtifactSnapshot | undefined {
  if (!artifact) return undefined;
  const videoUrl =
    typeof artifact.videoUrl === 'string'
      ? artifact.videoUrl
      : typeof artifact.artifactUrl === 'string'
        ? artifact.artifactUrl
        : undefined;
  if (!videoUrl || typeof artifact.durationSeconds !== 'number') {
    return undefined;
  }
  return {
    videoUrl,
    durationSeconds: artifact.durationSeconds,
    width: typeof artifact.width === 'number' ? artifact.width : undefined,
    height: typeof artifact.height === 'number' ? artifact.height : undefined,
    format: artifact.format === 'mp4' ? 'mp4' : undefined,
    artifactUrl: typeof artifact.artifactUrl === 'string' ? artifact.artifactUrl : undefined,
  };
}

function normalizeJob(raw: Record<string, unknown>): VideoExportJobSnapshot {
  return {
    id: String(raw.id),
    status: raw.status as VideoExportJobSnapshot['status'],
    step: String(raw.step ?? ''),
    progress: Number(raw.progress ?? 0),
    message: String(raw.message ?? ''),
    error: typeof raw.error === 'string' ? raw.error : undefined,
    artifact: normalizeArtifact(raw.artifact as Record<string, unknown> | undefined),
  };
}

export async function createVideoExportJobRequest(
  classroomId: string,
  options?: CreateVideoExportJobOptions,
): Promise<CreateVideoExportResult> {
  const response = await fetch('/api/extends/export-video', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      classroomId,
      strategy: 'static',
      resolution: '1080p',
      clientWillUploadAssets: options?.clientWillUploadAssets === true,
      serverNarrationFallback: options?.serverNarrationFallback === true,
    }),
  });
  const json = (await response.json().catch(() => null)) as {
    success?: boolean;
    jobId?: string;
    pollUrl?: string;
    error?: string;
  } | null;

  if (!response.ok || !json?.success || typeof json.jobId !== 'string') {
    return { ok: false, error: json?.error ?? `HTTP ${response.status}` };
  }

  return {
    ok: true,
    jobId: json.jobId,
    pollUrl: json.pollUrl ?? `/api/extends/export-video/${json.jobId}`,
  };
}

/** @deprecated Use createVideoExportJobRequest */
export const createVideoExportDraft = createVideoExportJobRequest;

export async function uploadVideoExportAssets(jobId: string, zip: Blob): Promise<void> {
  const formData = new FormData();
  formData.append('file', zip, 'export-audio.zip');
  const response = await fetch(`/api/extends/export-video/${encodeURIComponent(jobId)}/assets`, {
    method: 'POST',
    body: formData,
  });
  const json = (await response.json().catch(() => null)) as {
    success?: boolean;
    error?: string;
  } | null;
  if (!response.ok || !json?.success) {
    throw new Error(json?.error ?? `Failed to upload export assets (${response.status})`);
  }
}

export async function fetchVideoExportJob(jobId: string): Promise<VideoExportJobSnapshot | null> {
  const response = await fetch(`/api/extends/export-video/${encodeURIComponent(jobId)}`);
  const json = (await response.json().catch(() => null)) as {
    success?: boolean;
    job?: Record<string, unknown>;
  } | null;

  if (!response.ok || !json?.success || !json.job) {
    return null;
  }

  return normalizeJob(json.job);
}

export async function waitForVideoExportJob(
  jobId: string,
  options?: {
    intervalMs?: number;
    signal?: AbortSignal;
    onUpdate?: (job: VideoExportJobSnapshot) => void;
  },
): Promise<VideoExportJobSnapshot> {
  const intervalMs = options?.intervalMs ?? 1500;

  while (true) {
    if (options?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const job = await fetchVideoExportJob(jobId);
    if (!job) {
      throw new Error(`Video export job not found: ${jobId}`);
    }

    options?.onUpdate?.(job);

    if (job.status === 'succeeded' || job.status === 'failed') {
      return job;
    }

    await sleep(intervalMs, options?.signal);
  }
}

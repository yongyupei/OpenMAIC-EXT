/**
 * @extends-from components/course-editor/video-export-dialog.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { VideoExportJobSnapshot } from '@/lib/teacher/video-export-client';

export function VideoExportDialog({
  open,
  onOpenChange,
  busy,
  error,
  job,
  onCancel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  error: string | null;
  job: VideoExportJobSnapshot | null;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const videoUrl = job?.artifact?.videoUrl;
  const succeeded = job?.status === 'succeeded' && !!videoUrl;
  const progress = Math.min(100, Math.max(0, job?.progress ?? 0));
  const statusMessage =
    job?.message ||
    (busy ? t('courseEditor.videoExportSaving') : t('courseEditor.videoExportCreating'));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('courseEditor.videoExportDialogTitle')}</DialogTitle>
          <DialogDescription>{t('courseEditor.videoExportDialogDescription')}</DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        {busy && !succeeded ? (
          <div className="space-y-3">
            <Progress value={progress} />
            <p className="text-sm text-muted-foreground">{statusMessage}</p>
            {onCancel ? (
              <div className="flex justify-end">
                <Button type="button" variant="outline" size="sm" onClick={onCancel}>
                  {t('courseEditor.videoExportCancel')}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {succeeded ? (
          <div className="space-y-4">
            <p className="text-sm text-green-600 dark:text-green-500">
              {t('courseEditor.videoExportSucceeded', {
                duration: Math.round(job.artifact?.durationSeconds ?? 0),
              })}
            </p>
            <video
              controls
              className="w-full rounded-lg border bg-black"
              src={videoUrl}
              playsInline
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" asChild>
                <a href={`${videoUrl}?download=1`} download>
                  {t('courseEditor.videoExportDownload')}
                </a>
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

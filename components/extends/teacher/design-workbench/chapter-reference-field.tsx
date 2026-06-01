/**
 * @extends-from components/teacher/design-workbench/chapter-reference-field.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { useRef } from 'react';
import { FileSpreadsheet, FileText, FileType, Paperclip, Presentation, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import type { ChapterReferenceFile } from '@/lib/teacher/course-types';
import {
  CHAPTER_REFERENCE_ACCEPT,
  getChapterReferenceCategory,
  isChapterReferenceFileAllowed,
  isChapterReferenceLegacyFormat,
  type ChapterReferenceFileCategory,
} from '@/lib/teacher/chapter-reference-file-types';

const MAX_FILE_BYTES = 50 * 1024 * 1024;

function ReferenceFileIcon({ category }: { category: ChapterReferenceFileCategory }) {
  const className = 'size-3.5 shrink-0 text-muted-foreground';
  switch (category) {
    case 'excel':
      return <FileSpreadsheet className={className} aria-hidden="true" />;
    case 'powerpoint':
      return <Presentation className={className} aria-hidden="true" />;
    case 'text':
      return <FileType className={className} aria-hidden="true" />;
    default:
      return <FileText className={className} aria-hidden="true" />;
  }
}

interface ChapterReferenceFieldProps {
  readonly files: readonly ChapterReferenceFile[];
  readonly disabled?: boolean;
  readonly uploading?: boolean;
  readonly onUpload: (file: File) => void | Promise<void>;
  readonly onRemove: (fileId: string) => void | Promise<void>;
}

export function ChapterReferenceField({
  files,
  disabled = false,
  uploading = false,
  onUpload,
  onRemove,
}: ChapterReferenceFieldProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);

  const pickFile = () => {
    if (disabled || uploading) return;
    inputRef.current?.click();
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (isChapterReferenceLegacyFormat(file.name)) {
      toast.error(t('teacher.create.designWorkbench.referenceMaterialsLegacyFormat'));
      return;
    }
    if (!isChapterReferenceFileAllowed(file.name, file.type)) {
      toast.error(t('teacher.create.designWorkbench.referenceMaterialsUnsupportedType'));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error(t('upload.fileTooLarge'));
      return;
    }
    try {
      await onUpload(file);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('teacher.create.designWorkbench.referenceMaterialsUploadFailed'),
      );
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div>
      <Label className="text-xs">
        {t('teacher.create.designWorkbench.referenceMaterialsLabel')}
      </Label>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {t('teacher.create.designWorkbench.referenceMaterialsHint')}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept={CHAPTER_REFERENCE_ACCEPT}
        className="hidden"
        disabled={disabled || uploading}
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />
      <div className="mt-2 space-y-2">
        {files.map((file) => (
          <div
            key={file.id}
            className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5"
          >
            <ReferenceFileIcon category={getChapterReferenceCategory(file.name)} />
            <span className="min-w-0 flex-1 truncate text-xs">{file.name}</span>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {(file.size / 1024 / 1024).toFixed(1)} MB
            </span>
            <button
              type="button"
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
              disabled={disabled || uploading}
              aria-label={t('teacher.create.designWorkbench.referenceMaterialsRemove', {
                name: file.name,
              })}
              onClick={() => {
                void Promise.resolve(onRemove(file.id)).catch((error: unknown) => {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : t('teacher.create.designWorkbench.referenceMaterialsRemoveFailed'),
                  );
                });
              }}
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn('h-8 gap-1.5 text-xs', files.length === 0 && 'w-full justify-center')}
          disabled={disabled || uploading}
          onClick={pickFile}
        >
          <Paperclip className="size-3.5" />
          {uploading
            ? t('teacher.create.designWorkbench.referenceMaterialsUploading')
            : t('teacher.create.designWorkbench.referenceMaterialsUpload')}
        </Button>
      </div>
    </div>
  );
}

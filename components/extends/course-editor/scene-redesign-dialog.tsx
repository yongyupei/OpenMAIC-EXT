/**
 * @extends-from components/course-editor/scene-redesign-dialog.tsx
 * @fork-branch feat/html-slide-design-workbench
 *
 * Adds an "原始素材" panel showing the source outline (description / key
 * points / objective) and the existing scene narration. Lets users reference
 * the original generation context while writing the redesign brief.
 */
'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Sparkles,
  Loader2,
  X,
  Link2,
  FileUp,
  FileText,
  Trash2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { Scene } from '@/lib/types/stage';
import type { SceneOutline } from '@/lib/types/generation';
import type { ReferenceText } from '@/lib/hooks/use-scene-redesign';
import { cn } from '@/lib/utils';

interface SceneRedesignDialogProps {
  readonly scene: Scene | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly isRedesigning: boolean;
  readonly redesignStep: 'content' | 'actions' | null;
  readonly error: string | null;
  readonly onStartRedesign: (
    direction: string,
    referenceTexts: ReferenceText[],
    referenceLinks: string[],
  ) => void;
  readonly onCancel: () => void;
  /** Source outline that originally drove this scene (when available). */
  readonly sourceOutline?: SceneOutline | null;
  /** Existing speech/narration paragraphs from the scene actions, in order. */
  readonly speechTexts?: readonly string[];
}

const ACCEPT_FILE_TYPES =
  '.pdf,.docx,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown';

interface OriginalContextPanelProps {
  readonly outline: SceneOutline | null | undefined;
  readonly speechTexts: readonly string[];
}

function OriginalContextPanel({ outline, speechTexts }: OriginalContextPanelProps) {
  const { t } = useI18n();
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [speechOpen, setSpeechOpen] = useState(true);

  const hasOutline = !!outline && (
    !!outline.description?.trim() ||
    (outline.keyPoints && outline.keyPoints.length > 0) ||
    !!outline.teachingObjective?.trim()
  );
  const hasSpeech = speechTexts.length > 0;
  if (!hasOutline && !hasSpeech) return null;

  return (
    <div className="space-y-2 rounded-md border border-slate-200/70 bg-slate-50/70 p-3 dark:border-slate-700/60 dark:bg-slate-900/40">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t('courseEditor.redesignOriginalContext')}
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {hasOutline && outline ? (
          <section className="rounded border border-slate-200/60 bg-white/70 dark:border-slate-800/60 dark:bg-slate-900/60">
            <button
              type="button"
              onClick={() => setOutlineOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-100/70 dark:hover:bg-slate-800/60"
              aria-expanded={outlineOpen}
            >
              <span className="flex items-center gap-1.5">
                {outlineOpen ? (
                  <ChevronDown className="size-3.5" />
                ) : (
                  <ChevronRight className="size-3.5" />
                )}
                {t('courseEditor.redesignOriginalOutline')}
              </span>
            </button>
            {outlineOpen ? (
              <div className="max-h-72 space-y-2 overflow-y-auto border-t border-slate-200/60 px-2.5 py-2 text-xs leading-relaxed text-slate-700 dark:border-slate-800/60 dark:text-slate-200">
                {outline.description?.trim() ? (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {t('courseEditor.redesignOriginalDescription')}
                    </div>
                    <p className="whitespace-pre-wrap break-words">{outline.description.trim()}</p>
                  </div>
                ) : null}
                {outline.teachingObjective?.trim() ? (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {t('courseEditor.redesignOriginalObjective')}
                    </div>
                    <p className="whitespace-pre-wrap break-words">
                      {outline.teachingObjective.trim()}
                    </p>
                  </div>
                ) : null}
                {outline.keyPoints && outline.keyPoints.length > 0 ? (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {t('courseEditor.redesignOriginalKeyPoints')}
                    </div>
                    <ul className="list-disc space-y-0.5 pl-4">
                      {outline.keyPoints.map((kp, idx) => (
                        <li key={`${idx}-${kp.slice(0, 16)}`} className="break-words">
                          {kp}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        {hasSpeech ? (
          <section className="rounded border border-slate-200/60 bg-white/70 dark:border-slate-800/60 dark:bg-slate-900/60">
            <button
              type="button"
              onClick={() => setSpeechOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-100/70 dark:hover:bg-slate-800/60"
              aria-expanded={speechOpen}
            >
              <span className="flex items-center gap-1.5">
                {speechOpen ? (
                  <ChevronDown className="size-3.5" />
                ) : (
                  <ChevronRight className="size-3.5" />
                )}
                {t('courseEditor.redesignOriginalSpeech')}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {t('courseEditor.redesignOriginalSpeechCount', {
                  count: String(speechTexts.length),
                })}
              </span>
            </button>
            {speechOpen ? (
              <div className="max-h-72 space-y-2 overflow-y-auto border-t border-slate-200/60 px-2.5 py-2 text-xs leading-relaxed text-slate-700 dark:border-slate-800/60 dark:text-slate-200">
                {speechTexts.map((text, idx) => (
                  <p
                    key={`speech-${idx}`}
                    className="whitespace-pre-wrap break-words"
                  >
                    <span className="mr-1 inline-flex h-4 min-w-[1.1rem] items-center justify-center rounded-sm bg-purple-100 px-1 text-[10px] font-medium text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                      {idx + 1}
                    </span>
                    {text}
                  </p>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}

export function SceneRedesignDialog({
  scene,
  open,
  onOpenChange,
  isRedesigning,
  redesignStep,
  error,
  onStartRedesign,
  onCancel,
  sourceOutline = null,
  speechTexts = [],
}: SceneRedesignDialogProps) {
  const { t } = useI18n();
  const [direction, setDirection] = useState('');
  const [linkInput, setLinkInput] = useState('');
  const [referenceLinks, setReferenceLinks] = useState<string[]>([]);
  const [linkContents, setLinkContents] = useState<ReferenceText[]>([]);
  const [fetchingLinkUrl, setFetchingLinkUrl] = useState<string | null>(null);
  const [linkFetchError, setLinkFetchError] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<ReferenceText[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClose = () => {
    if (isRedesigning) return;
    onOpenChange(false);
  };

  const handleAddLink = async () => {
    const trimmed = linkInput.trim();
    if (!trimmed || fetchingLinkUrl !== null) return;

    let url: URL;
    try {
      url = new URL(trimmed);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error();
    } catch {
      setLinkFetchError(t('courseEditor.redesignInvalidUrl'));
      return;
    }

    setFetchingLinkUrl(trimmed);
    setLinkFetchError(null);

    try {
      const res = await fetch('/api/extends/fetch-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setLinkFetchError(data.error || t('courseEditor.redesignFetchLinkFailed'));
      } else {
        setLinkContents((prev) => [...prev, { fileName: trimmed, text: data.text as string }]);
        setReferenceLinks((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
        setLinkInput('');
      }
    } catch {
      setLinkFetchError(t('courseEditor.redesignFetchLinkFailed'));
    } finally {
      setFetchingLinkUrl(null);
    }
  };

  const handleRemoveLink = (link: string) => {
    setReferenceLinks((prev) => prev.filter((l) => l !== link));
    setLinkContents((prev) => prev.filter((c) => c.fileName !== link));
  };

  const handleStart = () => {
    onStartRedesign(direction.trim(), [...uploadedFiles, ...linkContents], []);
  };

  const handleFileUpload = useCallback(
    async (file: File) => {
      setIsUploading(true);
      setUploadError(null);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/extends/parse-document', {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || t('courseEditor.redesignUploadFailed'));
        }
        const data = await res.json();
        setUploadedFiles((prev) => [
          ...prev,
          { fileName: data.fileName as string, text: data.text as string },
        ]);
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : t('courseEditor.redesignUploadFailed'));
      } finally {
        setIsUploading(false);
      }
    },
    [t],
  );

  const handleRemoveFile = (fileName: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.fileName !== fileName));
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isUploading || isRedesigning) return;
      const file = e.dataTransfer.files?.[0];
      if (file) handleFileUpload(file);
    },
    [handleFileUpload, isUploading, isRedesigning],
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    e.target.value = '';
  };

  if (!scene) return null;

  const typeLabel = t(`courseEditor.sceneTypeLabel.${scene.type}`);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="flex max-h-[90vh] w-[min(96vw,1100px)] flex-col gap-0 p-0 sm:max-w-[1100px]"
        onPointerDownOutside={(e) => {
          if (isRedesigning) e.preventDefault();
        }}
      >
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-purple-600" />
            {t('courseEditor.redesignTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {isRedesigning ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="size-8 animate-spin text-purple-600" />
              <div className="text-sm text-muted-foreground">
                {redesignStep === 'content' && t('courseEditor.redesignStepContent')}
                {redesignStep === 'actions' && t('courseEditor.redesignStepActions')}
                {!redesignStep && t('courseEditor.redesignGenerating')}
              </div>
            </div>
          ) : error ? (
            <div className="space-y-3">
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
              <Button variant="outline" size="sm" onClick={() => handleStart()} className="w-full">
                {t('courseEditor.redesignRetry')}
              </Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {/* Left column */}
                <div className="flex flex-col gap-3">
                  {/* Scene title — inline label + value */}
                  <div className="text-sm">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t('courseEditor.sceneTitle')}:
                    </span>{' '}
                    <span className="font-medium">{scene.title}</span>
                  </div>

                  {/* Direction */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t('courseEditor.redesignDirection')}:
                    </label>
                    <Textarea
                      value={direction}
                      onChange={(e) => setDirection(e.target.value)}
                      placeholder={t('courseEditor.redesignDirectionPlaceholder')}
                      className="min-h-[280px] flex-1 resize-y"
                    />
                  </div>
                </div>

                {/* Right column */}
                <div className="flex flex-col gap-3">
                  {/* Scene type — inline label + badge */}
                  <div className="text-sm">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t('courseEditor.redesignSceneType')}:
                    </span>{' '}
                    <span className="rounded bg-purple-50 px-1.5 py-0.5 text-xs text-purple-700 dark:bg-purple-900/20 dark:text-purple-400">
                      {typeLabel}
                    </span>
                  </div>

                  {/* References */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t('courseEditor.redesignReferences')}:
                    </label>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ACCEPT_FILE_TYPES}
                      className="hidden"
                      onChange={handleFileInputChange}
                    />
                    <div
                      onDrop={handleDrop}
                      onDragOver={handleDragOver}
                      onClick={() => {
                        if (!isUploading && !isRedesigning) {
                          fileInputRef.current?.click();
                        }
                      }}
                      className={cn(
                        'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed p-3 text-xs text-muted-foreground transition-colors',
                        isUploading || isRedesigning
                          ? 'cursor-not-allowed opacity-60'
                          : 'hover:border-purple-300 hover:bg-purple-50/50 dark:hover:border-purple-700 dark:hover:bg-purple-900/10',
                      )}
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="size-4 animate-spin text-purple-600" />
                          <span>{t('courseEditor.redesignUploading')}</span>
                        </>
                      ) : (
                        <>
                          <FileUp className="size-4" />
                          <span>{t('courseEditor.redesignUploadDoc')}</span>
                          <span className="text-[10px] opacity-70">
                            {t('courseEditor.redesignUploadDocHint')}
                          </span>
                        </>
                      )}
                    </div>

                    {uploadError && (
                      <div className="text-xs text-red-600 dark:text-red-400">{uploadError}</div>
                    )}

                    {uploadedFiles.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        {uploadedFiles.map((file) => (
                          <div
                            key={file.fileName}
                            className="flex items-center justify-between gap-2 rounded-md border bg-secondary/40 px-2.5 py-1.5 text-xs"
                          >
                            <div className="flex min-w-0 items-center gap-1.5">
                              <FileText className="size-3.5 shrink-0 text-purple-600" />
                              <span className="truncate">{file.fileName}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveFile(file.fileName)}
                              className="shrink-0 rounded p-0.5 hover:bg-muted"
                              title={t('courseEditor.redesignRemoveFile')}
                            >
                              <Trash2 className="size-3 text-muted-foreground" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Input
                        value={linkInput}
                        onChange={(e) => {
                          setLinkInput(e.target.value);
                          setLinkFetchError(null);
                        }}
                        placeholder="https://..."
                        disabled={fetchingLinkUrl !== null || isRedesigning}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddLink();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddLink}
                        disabled={
                          !linkInput.trim() || fetchingLinkUrl !== null || isRedesigning
                        }
                      >
                        {fetchingLinkUrl !== null ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Link2 className="size-4" />
                        )}
                      </Button>
                    </div>

                    {linkFetchError && (
                      <div className="text-xs text-red-600 dark:text-red-400">
                        {linkFetchError}
                      </div>
                    )}

                    {referenceLinks.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {referenceLinks.map((link) => (
                          <span
                            key={link}
                            className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs"
                          >
                            {link.length > 40 ? `${link.slice(0, 40)}...` : link}
                            <button
                              type="button"
                              onClick={() => handleRemoveLink(link)}
                              className="rounded-full p-0.5 hover:bg-muted"
                            >
                              <X className="size-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <OriginalContextPanel outline={sourceOutline} speechTexts={speechTexts} />
            </>
          )}
        </div>

        {/* Footer actions */}
        <div className="shrink-0 border-t bg-background/60 px-6 py-3">
          <div className="flex justify-end gap-2">
            {isRedesigning ? (
              <Button variant="outline" size="sm" onClick={onCancel}>
                {t('courseEditor.redesignCancelGeneration')}
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                  {t('courseEditor.redesignCancel')}
                </Button>
                <Button
                  size="sm"
                  onClick={handleStart}
                  disabled={!direction.trim()}
                  className="gap-1.5"
                >
                  <Sparkles className="size-3.5" />
                  {t('courseEditor.redesignStart')}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

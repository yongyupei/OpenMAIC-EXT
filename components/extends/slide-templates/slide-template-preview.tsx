/**
 * @extends-from components/slide-templates/slide-template-preview.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { ThumbnailSlide } from '@/components/slide-renderer/components/ThumbnailSlide';
import { buildTemplatePreviewSlide } from '@/lib/slide-templates/build-template-preview-slide';
import type { SlideTemplateRecord } from '@/lib/slide-templates/types';
import { SLIDE_CANVAS_HEIGHT, SLIDE_CANVAS_WIDTH } from '@/lib/slide-templates/constants';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

export interface SlideTemplatePreviewProps {
  readonly template: SlideTemplateRecord;
  readonly className?: string;
}

export function SlideTemplatePreview({ template, className }: SlideTemplatePreviewProps) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  const slide = useMemo(
    () =>
      buildTemplatePreviewSlide(template, {
        bullet1: t('slideTemplates.previewBullet1'),
        bullet2: t('slideTemplates.previewBullet2'),
        bullet3: t('slideTemplates.previewBullet3'),
        blocksLabel: t('slideTemplates.previewBlocksLabel'),
      }),
    [template, t],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setWidth(Math.floor(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const viewportRatio = SLIDE_CANVAS_HEIGHT / SLIDE_CANVAS_WIDTH;

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-3', className)}>
      <p className="text-xs text-muted-foreground">{t('slideTemplates.previewHint')}</p>
      <div
        ref={containerRef}
        className="flex min-h-0 flex-1 items-center justify-center rounded-lg border bg-muted/30 p-4"
      >
        {width > 0 ? (
          <ThumbnailSlide
            slide={slide}
            size={width}
            viewportSize={SLIDE_CANVAS_WIDTH}
            viewportRatio={viewportRatio}
          />
        ) : (
          <div className="aspect-video w-full max-w-2xl animate-pulse rounded-md bg-muted" />
        )}
      </div>
      {template.description ? (
        <p className="text-sm text-muted-foreground">{template.description}</p>
      ) : null}
    </div>
  );
}

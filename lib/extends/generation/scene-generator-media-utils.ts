/**
 * Media / element post-processing helpers for scene content generation.
 */
import katex from 'katex';

import { createLogger } from '@/lib/logger';
import type { SceneOutline } from '@/lib/types/generation';
import type { GeneratedSlideData } from '@/lib/generation/pipeline-types';
import type { PdfImage, ImageMapping } from '@/lib/types/generation';

const log = createLogger('Generation');

function isImageIdReference(value: string): boolean {
  if (!value) return false;
  if (value.startsWith('data:')) return false;
  if (value.startsWith('http://') || value.startsWith('https://')) return false;
  if (value.startsWith('/')) return false;
  return /^img_\d+$/i.test(value);
}

function isGeneratedImageId(value: string): boolean {
  if (!value) return false;
  return /^gen_(img|vid)_[\w-]+$/i.test(value);
}

export function resolveImageIds(
  elements: GeneratedSlideData['elements'],
  imageMapping?: ImageMapping,
  generatedMediaMapping?: ImageMapping,
): GeneratedSlideData['elements'] {
  return elements
    .map((el) => {
      if (el.type === 'image') {
        if (!('src' in el)) {
          log.warn(`Image element missing src, removing element`);
          return null;
        }
        const src = el.src as string;

        if (isImageIdReference(src)) {
          if (!imageMapping || !imageMapping[src]) {
            log.warn(`No mapping for image ID: ${src}, removing element`);
            return null;
          }
          log.debug(`Resolved image ID "${src}" to base64 URL`);
          return { ...el, src: imageMapping[src] };
        }

        if (isGeneratedImageId(src)) {
          if (generatedMediaMapping && generatedMediaMapping[src]) {
            log.debug(`Resolved generated image ID "${src}" to URL`);
            return { ...el, src: generatedMediaMapping[src] };
          }
          log.debug(`Keeping generated image placeholder: ${src}`);
          return el;
        }
      }

      if (el.type === 'video') {
        const mediaRef = (el as Record<string, unknown>).mediaRef;
        if (!('src' in el) && typeof mediaRef !== 'string') {
          log.warn(`Video element missing src, removing element`);
          return null;
        }
        const src = el.src as string;
        if (isGeneratedImageId(src)) {
          if (generatedMediaMapping && generatedMediaMapping[src]) {
            log.debug(`Resolved generated video ID "${src}" to URL`);
            return { ...el, src: generatedMediaMapping[src] };
          }
          log.debug(`Keeping generated video placeholder: ${src}`);
          return el;
        }
      }

      return el;
    })
    .filter((el): el is NonNullable<typeof el> => el !== null);
}

export function normalizeGeneratedVideoRefs(
  elements: GeneratedSlideData['elements'],
  generatedVideoEntries: SceneOutline['mediaGenerations'] = [],
): GeneratedSlideData['elements'] {
  const validRefs = generatedVideoEntries
    .filter((mg) => mg.type === 'video')
    .map((mg) => mg.elementId);

  const validRefSet = new Set(validRefs);
  const onlyRef = validRefs.length === 1 ? validRefs[0] : undefined;

  return elements
    .map((el) => {
      if (el.type !== 'video') return el;

      const videoEl = { ...el } as Record<string, unknown>;
      const mediaRef = typeof videoEl.mediaRef === 'string' ? videoEl.mediaRef : undefined;
      const src = typeof videoEl.src === 'string' ? videoEl.src : undefined;
      const hasGeneratedSrc = !!src && isGeneratedImageId(src);
      const hasDirectSrc = !!src && !hasGeneratedSrc;

      if (hasDirectSrc) {
        if (mediaRef) delete videoEl.mediaRef;
        return videoEl as typeof el;
      }

      if (mediaRef && validRefSet.has(mediaRef)) {
        if (hasGeneratedSrc) delete videoEl.src;
        return videoEl as typeof el;
      }

      if (src && validRefSet.has(src)) {
        videoEl.mediaRef = src;
        delete videoEl.src;
        return videoEl as typeof el;
      }

      if ((mediaRef || hasGeneratedSrc) && onlyRef) {
        log.warn(`Correcting generated video reference "${mediaRef || src}" to "${onlyRef}"`);
        videoEl.mediaRef = onlyRef;
        if (hasGeneratedSrc) delete videoEl.src;
        return videoEl as typeof el;
      }

      if (mediaRef || hasGeneratedSrc) {
        log.warn(`Invalid generated video reference "${mediaRef || src}", removing element`);
        return null;
      }

      return el;
    })
    .filter((el): el is NonNullable<typeof el> => el !== null);
}

export function fixElementDefaults(
  elements: GeneratedSlideData['elements'],
  assignedImages?: PdfImage[],
): GeneratedSlideData['elements'] {
  return elements.map((el) => {
    if (el.type === 'line') {
      const lineEl = el as Record<string, unknown>;

      if (!lineEl.points || !Array.isArray(lineEl.points) || lineEl.points.length !== 2) {
        log.warn(`Line element missing points, adding defaults`);
        lineEl.points = ['', ''] as [string, string];
      }

      if (!lineEl.start || !Array.isArray(lineEl.start)) {
        lineEl.start = [el.left ?? 0, el.top ?? 0];
      }
      if (!lineEl.end || !Array.isArray(lineEl.end)) {
        lineEl.end = [(el.left ?? 0) + (el.width ?? 100), (el.top ?? 0) + (el.height ?? 0)];
      }

      if (!lineEl.style) {
        lineEl.style = 'solid';
      }

      if (!lineEl.color) {
        lineEl.color = '#333333';
      }

      return lineEl as typeof el;
    }

    if (el.type === 'text') {
      const textEl = el as Record<string, unknown>;

      if (!textEl.defaultFontName) {
        textEl.defaultFontName = 'Microsoft YaHei';
      }
      if (!textEl.defaultColor) {
        textEl.defaultColor = '#333333';
      }
      if (!textEl.content) {
        textEl.content = '';
      }

      return textEl as typeof el;
    }

    if (el.type === 'image') {
      const imageEl = el as Record<string, unknown>;

      if (imageEl.fixedRatio === undefined) {
        imageEl.fixedRatio = true;
      }

      if (assignedImages && typeof imageEl.src === 'string') {
        const imgMeta = assignedImages.find((img) => img.id === imageEl.src);
        if (imgMeta?.width && imgMeta?.height) {
          const knownRatio = imgMeta.width / imgMeta.height;
          const curW = (el.width || 400) as number;
          const curH = (el.height || 300) as number;
          if (Math.abs(curW / curH - knownRatio) / knownRatio > 0.1) {
            const newH = Math.round(curW / knownRatio);
            if (newH > 462) {
              const newW = Math.round(462 * knownRatio);
              imageEl.width = newW;
              imageEl.height = 462;
            } else {
              imageEl.height = newH;
            }
          }
        }
      }

      return imageEl as typeof el;
    }

    if (el.type === 'shape') {
      const shapeEl = el as Record<string, unknown>;

      if (!shapeEl.viewBox) {
        shapeEl.viewBox = `0 0 ${el.width ?? 100} ${el.height ?? 100}`;
      }
      if (!shapeEl.path) {
        const w = el.width ?? 100;
        const h = el.height ?? 100;
        shapeEl.path = `M0 0 L${w} 0 L${w} ${h} L0 ${h} Z`;
      }
      if (!shapeEl.fill) {
        shapeEl.fill = '#5b9bd5';
      }
      if (shapeEl.fixedRatio === undefined) {
        shapeEl.fixedRatio = false;
      }

      return shapeEl as typeof el;
    }

    return el;
  });
}

export function processLatexElements(
  elements: GeneratedSlideData['elements'],
): GeneratedSlideData['elements'] {
  return elements
    .map((el) => {
      if (el.type !== 'latex') return el;

      const latexStr = el.latex as string | undefined;
      if (!latexStr) {
        log.warn('Latex element missing latex string, removing');
        return null;
      }

      try {
        const html = katex.renderToString(latexStr, {
          throwOnError: false,
          displayMode: true,
          output: 'html',
        });

        return {
          ...el,
          html,
          fixedRatio: true,
        };
      } catch (err) {
        log.warn(`Failed to render latex "${latexStr}":`, err);
        return null;
      }
    })
    .filter((el): el is NonNullable<typeof el> => el !== null);
}

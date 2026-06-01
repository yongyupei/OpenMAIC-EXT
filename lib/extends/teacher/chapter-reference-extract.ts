/**
 * @extends-from lib/teacher/chapter-reference-extract.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import JSZip from 'jszip';

import { getCurrentPDFConfig, parsePDF } from '@/lib/pdf/pdf-providers';
import type { ParsedPdfContent } from '@/lib/types/pdf';
import { createLogger } from '@/lib/logger';
import { getChapterReferenceCategory } from '@/lib/teacher/chapter-reference-file-types';

const log = createLogger('ChapterReferenceExtract');

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function stripOfficeXml(xml: string): string {
  return decodeXmlEntities(
    xml
      .replace(/<w:tab[^/]*\/>/g, '\t')
      .replace(/<a:tab[^/]*\/>/g, '\t')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function collectXmlTextNodes(xml: string): string {
  const chunks: string[] = [];
  const pattern = /<(?:w:t|a:t|t)(?:\s[^>]*)?>([^<]*)<\/(?:w:t|a:t|t)>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    const piece = decodeXmlEntities(match[1]).trim();
    if (piece) chunks.push(piece);
  }
  if (chunks.length > 0) return chunks.join(' ');
  return stripOfficeXml(xml);
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const entry = zip.file('word/document.xml');
  if (!entry) throw new Error('Invalid Word document');
  const xml = await entry.async('string');
  return collectXmlTextNodes(xml);
}

async function extractPptxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const slidePaths = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (slidePaths.length === 0) throw new Error('Invalid PowerPoint file');

  const parts: string[] = [];
  for (const path of slidePaths) {
    const entry = zip.file(path);
    if (!entry) continue;
    const xml = await entry.async('string');
    const text = collectXmlTextNodes(xml);
    if (text) parts.push(text);
  }
  return parts.join('\n\n');
}

async function extractXlsxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const sharedEntry = zip.file('xl/sharedStrings.xml');
  if (sharedEntry) {
    const xml = await sharedEntry.async('string');
    const text = collectXmlTextNodes(xml);
    if (text) return text;
  }

  const sheetEntry = zip.file('xl/worksheets/sheet1.xml');
  if (!sheetEntry) throw new Error('Invalid Excel workbook');
  const xml = await sheetEntry.async('string');
  return collectXmlTextNodes(xml);
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  let parsed: ParsedPdfContent;
  try {
    const config = await getCurrentPDFConfig();
    parsed = await parsePDF(config, buffer);
  } catch {
    parsed = await parsePDF({ providerId: 'unpdf' }, buffer);
  }
  return parsed.text?.trim() ?? '';
}

export async function extractChapterReferenceText(
  buffer: Buffer,
  fileName: string,
): Promise<string | undefined> {
  const category = getChapterReferenceCategory(fileName);

  try {
    switch (category) {
      case 'text':
        return buffer.toString('utf8').trim() || undefined;
      case 'pdf': {
        const text = await extractPdfText(buffer);
        return text || undefined;
      }
      case 'word':
        return (await extractDocxText(buffer)) || undefined;
      case 'powerpoint':
        return (await extractPptxText(buffer)) || undefined;
      case 'excel':
        return (await extractXlsxText(buffer)) || undefined;
      default:
        return undefined;
    }
  } catch (error) {
    log.warn(`Failed to extract text from reference "${fileName}":`, error);
    return undefined;
  }
}

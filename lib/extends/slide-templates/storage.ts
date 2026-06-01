/**
 * @extends-from lib/slide-templates/storage.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { promises as fs } from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';

import { SLIDE_TEMPLATES_DIR } from '@/lib/slide-templates/constants';
import type { SlideTemplateRecord, SlideTemplateScope } from '@/lib/slide-templates/types';
import { writeJsonFileAtomic } from '@/lib/server/classroom-storage';

const META_PATH = path.join(SLIDE_TEMPLATES_DIR, 'meta.json');
const GLOBAL_DIR = path.join(SLIDE_TEMPLATES_DIR, 'global');

export interface SlideTemplateIndexEntry {
  id: string;
  name: string;
  scope: SlideTemplateScope;
}

export interface SlideTemplatesMeta {
  revision: number;
  templateIndex: SlideTemplateIndexEntry[];
}

export function isValidSlideTemplateId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

function globalTemplatePath(id: string): string {
  if (!isValidSlideTemplateId(id)) {
    throw new Error(`Invalid slide template id: ${id}`);
  }
  return path.join(GLOBAL_DIR, `${id}.json`);
}

async function readSlideTemplatesMeta(): Promise<SlideTemplatesMeta | null> {
  try {
    const raw = await fs.readFile(META_PATH, 'utf-8');
    return JSON.parse(raw) as SlideTemplatesMeta;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function writeSlideTemplatesMeta(meta: SlideTemplatesMeta): Promise<void> {
  await writeJsonFileAtomic(META_PATH, meta);
}

export async function ensureSlideTemplatesInitialized(): Promise<void> {
  try {
    await fs.access(META_PATH);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const meta: SlideTemplatesMeta = {
    revision: 0,
    templateIndex: [],
  };

  await writeSlideTemplatesMeta(meta);
}

async function loadMeta(): Promise<SlideTemplatesMeta> {
  await ensureSlideTemplatesInitialized();
  const meta = await readSlideTemplatesMeta();
  if (!meta) {
    throw new Error('Slide templates meta is not initialized');
  }
  return meta;
}

function parseSlideTemplateRecord(raw: string): SlideTemplateRecord | null {
  try {
    return JSON.parse(raw) as SlideTemplateRecord;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

export async function listGlobalSlideTemplates(): Promise<SlideTemplateRecord[]> {
  const meta = await loadMeta();
  const globalEntries = meta.templateIndex.filter((entry) => entry.scope === 'global');

  const records = await Promise.all(
    globalEntries.map(async (entry) => readGlobalSlideTemplate(entry.id)),
  );

  return records
    .filter((record): record is SlideTemplateRecord => record !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function readGlobalSlideTemplate(
  id: string,
): Promise<SlideTemplateRecord | undefined> {
  if (!isValidSlideTemplateId(id)) {
    return undefined;
  }

  try {
    const raw = await fs.readFile(globalTemplatePath(id), 'utf-8');
    return parseSlideTemplateRecord(raw) ?? undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

export async function writeGlobalSlideTemplate(
  record: Omit<SlideTemplateRecord, 'id' | 'scope' | 'createdAt' | 'updatedAt'> &
    Partial<Pick<SlideTemplateRecord, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<SlideTemplateRecord> {
  const meta = await loadMeta();
  const now = new Date().toISOString();
  const id = record.id ?? nanoid();
  const existing = record.id ? await readGlobalSlideTemplate(record.id) : undefined;

  const stored: SlideTemplateRecord = {
    ...record,
    id,
    scope: 'global',
    projectId: undefined,
    createdAt: existing?.createdAt ?? record.createdAt ?? now,
    updatedAt: now,
  };

  await writeJsonFileAtomic(globalTemplatePath(id), stored);

  const indexEntry: SlideTemplateIndexEntry = {
    id,
    name: stored.name,
    scope: 'global',
  };

  const templateIndex = meta.templateIndex.filter((entry) => entry.id !== id);
  templateIndex.push(indexEntry);

  await writeSlideTemplatesMeta({
    revision: meta.revision + 1,
    templateIndex,
  });

  return stored;
}

export async function deleteGlobalSlideTemplate(id: string): Promise<boolean> {
  const meta = await loadMeta();
  const indexEntry = meta.templateIndex.find((entry) => entry.id === id && entry.scope === 'global');
  if (!indexEntry) {
    return false;
  }

  try {
    await fs.unlink(globalTemplatePath(id));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  await writeSlideTemplatesMeta({
    revision: meta.revision + 1,
    templateIndex: meta.templateIndex.filter((entry) => entry.id !== id),
  });

  return true;
}

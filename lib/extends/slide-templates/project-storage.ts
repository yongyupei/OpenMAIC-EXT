/**
 * @extends-from lib/slide-templates/project-storage.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { promises as fs } from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';

import { getBuiltinSlideTemplate } from '@/lib/slide-templates/builtins';
import { isValidSlideTemplateId, readGlobalSlideTemplate } from '@/lib/slide-templates/storage';
import type { SlideTemplateRecord } from '@/lib/slide-templates/types';
import { writeJsonFileAtomic } from '@/lib/server/classroom-storage';
import {
  TEACHER_PROJECTS_DIR,
  isValidTeacherProjectId,
} from '@/lib/teacher/course-project-storage';

function projectSlideTemplatesDir(projectId: string): string {
  if (!isValidTeacherProjectId(projectId)) {
    throw new Error(`Invalid teacher project id: ${projectId}`);
  }
  return path.join(TEACHER_PROJECTS_DIR, projectId, 'slide-templates');
}

function projectTemplatePath(projectId: string, templateId: string): string {
  if (!isValidSlideTemplateId(templateId)) {
    throw new Error(`Invalid slide template id: ${templateId}`);
  }
  return path.join(projectSlideTemplatesDir(projectId), `${templateId}.json`);
}

function parseSlideTemplateRecord(raw: string): SlideTemplateRecord | null {
  try {
    return JSON.parse(raw) as SlideTemplateRecord;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

export async function listProjectSlideTemplates(
  projectId: string,
): Promise<SlideTemplateRecord[]> {
  const dir = projectSlideTemplatesDir(projectId);
  let fileNames: string[];
  try {
    fileNames = await fs.readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  const records = await Promise.all(
    fileNames
      .filter((fileName) => fileName.endsWith('.json'))
      .map(async (fileName) => {
        const templateId = path.basename(fileName, '.json');
        if (!isValidSlideTemplateId(templateId)) return null;
        const raw = await fs.readFile(path.join(dir, fileName), 'utf-8');
        return parseSlideTemplateRecord(raw);
      }),
  );

  return records
    .filter((record): record is SlideTemplateRecord => record !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function readProjectSlideTemplate(
  projectId: string,
  templateId: string,
): Promise<SlideTemplateRecord | undefined> {
  if (!isValidTeacherProjectId(projectId) || !isValidSlideTemplateId(templateId)) {
    return undefined;
  }

  try {
    const raw = await fs.readFile(projectTemplatePath(projectId, templateId), 'utf-8');
    return parseSlideTemplateRecord(raw) ?? undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

export async function writeProjectSlideTemplate(
  projectId: string,
  record: Omit<SlideTemplateRecord, 'id' | 'scope' | 'projectId' | 'createdAt' | 'updatedAt'> &
    Partial<Pick<SlideTemplateRecord, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<SlideTemplateRecord> {
  const now = new Date().toISOString();
  const id = record.id ?? nanoid();
  const existing = record.id
    ? await readProjectSlideTemplate(projectId, record.id)
    : undefined;

  const stored: SlideTemplateRecord = {
    ...record,
    id,
    scope: 'project',
    projectId,
    createdAt: existing?.createdAt ?? record.createdAt ?? now,
    updatedAt: now,
  };

  await writeJsonFileAtomic(projectTemplatePath(projectId, id), stored);
  return stored;
}

export async function deleteProjectSlideTemplate(
  projectId: string,
  templateId: string,
): Promise<boolean> {
  try {
    await fs.unlink(projectTemplatePath(projectId, templateId));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function resolveForkSource(
  projectId: string,
  sourceId: string,
): Promise<SlideTemplateRecord | undefined> {
  const builtin = getBuiltinSlideTemplate(sourceId);
  if (builtin) {
    return builtin;
  }

  const globalTemplate = await readGlobalSlideTemplate(sourceId);
  if (globalTemplate) {
    return globalTemplate;
  }

  return readProjectSlideTemplate(projectId, sourceId);
}

export async function forkSlideTemplateToProject(
  projectId: string,
  sourceId: string,
): Promise<SlideTemplateRecord> {
  const source = await resolveForkSource(projectId, sourceId);
  if (!source) {
    throw new Error(`Slide template not found: ${sourceId}`);
  }

  return writeProjectSlideTemplate(projectId, {
    name: source.name,
    description: source.description,
    theme: source.theme,
    layouts: source.layouts,
    forkedFromId: sourceId,
    ownerId: source.ownerId,
    workspaceId: source.workspaceId,
  });
}

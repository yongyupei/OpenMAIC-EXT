/**
 * @extends-from lib/server/classroom-storage.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import path from 'path';

import type { Scene, Stage } from '@/lib/types/stage';

export {
  CLASSROOMS_DIR,
  CLASSROOM_JOBS_DIR,
  buildRequestOrigin,
  ensureClassroomJobsDir,
  ensureClassroomsDir,
  isValidClassroomId,
  readClassroom,
  writeJsonFileAtomic,
} from '../../server/classroom-storage';

export type { PersistedClassroomData } from '../../server/classroom-storage';

import {
  CLASSROOMS_DIR,
  ensureClassroomsDir,
  persistClassroom as upstreamPersistClassroom,
  readClassroom,
  writeJsonFileAtomic,
} from '../../server/classroom-storage';
import type { PersistedClassroomData } from '../../server/classroom-storage';

type PersistClassroomInput = {
  id: string;
  stage: Stage;
  scenes: Scene[];
  sourceWorkflowId?: string;
};

interface PersistedClassroomRevision extends PersistedClassroomData {
  updatedAt: string;
  revision: number;
  publishedArtifacts?: PublishedArtifact[];
}

export type PublishedArtifactStatus = 'succeeded' | 'failed' | 'pending';

export interface PublishedArtifact {
  id: string;
  type: string;
  url: string;
  createdAt: string;
  status: PublishedArtifactStatus;
}

type StoredClassroomRecord = PersistedClassroomData & {
  updatedAt?: string;
  revision?: number;
  publishedArtifacts?: PublishedArtifact[];
};

export async function appendPublishedArtifact(
  classroomId: string,
  artifact: PublishedArtifact,
): Promise<void> {
  await ensureClassroomsDir();
  const existing = await readClassroom(classroomId);
  if (!existing) {
    throw new Error(`Classroom not found: ${classroomId}`);
  }

  const record = existing as StoredClassroomRecord;
  const artifacts = [...(record.publishedArtifacts ?? [])];
  const existingIndex = artifacts.findIndex((item) => item.id === artifact.id);
  if (existingIndex >= 0) {
    artifacts[existingIndex] = artifact;
  } else {
    artifacts.push(artifact);
  }

  const now = new Date().toISOString();
  const updated: StoredClassroomRecord = {
    ...record,
    publishedArtifacts: artifacts,
    updatedAt: now,
    revision: typeof record.revision === 'number' ? record.revision + 1 : 1,
  };

  const filePath = path.join(CLASSROOMS_DIR, `${classroomId}.json`);
  await writeJsonFileAtomic(filePath, updated);
}

export async function persistClassroom(
  data: PersistClassroomInput,
  baseUrl: string,
): Promise<PersistedClassroomData & { url: string }> {
  const { sourceWorkflowId: _sourceWorkflowId, ...payload } = data;
  return upstreamPersistClassroom(payload, baseUrl);
}

export async function updateClassroom(
  data: {
    id: string;
    stage: Stage;
    scenes: Scene[];
  },
  baseUrl: string,
): Promise<PersistedClassroomRevision & { url: string }> {
  await ensureClassroomsDir();
  const existing = await readClassroom(data.id);
  const now = new Date().toISOString();
  const existingRecord = existing as StoredClassroomRecord | null;
  const previousRevision =
    existingRecord && typeof existingRecord.revision === 'number' ? existingRecord.revision : 0;

  const classroomData: PersistedClassroomRevision = {
    id: data.id,
    stage: data.stage,
    scenes: data.scenes,
    createdAt: existingRecord?.createdAt ?? now,
    updatedAt: now,
    revision: previousRevision + 1,
    ...(existingRecord?.publishedArtifacts
      ? { publishedArtifacts: existingRecord.publishedArtifacts }
      : {}),
  };

  const filePath = path.join(CLASSROOMS_DIR, `${data.id}.json`);
  await writeJsonFileAtomic(filePath, classroomData);

  return {
    ...classroomData,
    url: `${baseUrl}/classroom/${data.id}`,
  };
}

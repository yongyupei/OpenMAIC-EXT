/**
 * @extends-from lib/knowledge-base/types.ts
 * @fork-branch feat/html-slide-design-workbench
 */
/** MVP: single default library; multi-library reserved for later */
export interface KnowledgeBaseMeta {
  id: string;
  name: string;
  rootId: string;
  revision: number;
  ownerId?: string;
  workspaceId?: string;
  createdAt: string;
  updatedAt: string;
}

export type KnowledgeNodeType = 'folder' | 'file';

export interface KnowledgeNode {
  id: string;
  parentId: string | null;
  type: KnowledgeNodeType;
  name: string;
  /** Display path; recomputed on apply */
  displayPath: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  /** Required when type === 'file' */
  file?: KnowledgeFileMeta;
}

export type KnowledgeParseStatus =
  | 'pending'
  | 'ready'
  | 'partial'
  | 'unsupported'
  | 'failed';

export type KnowledgeFileCategory =
  | 'pdf'
  | 'word'
  | 'excel'
  | 'powerpoint'
  | 'text'
  | 'html'
  | 'image'
  | 'archive'
  | 'media'
  | 'unknown';

export interface KnowledgeFileMeta {
  storageKey: string;
  originalName: string;
  mimeType: string;
  size: number;
  category: KnowledgeFileCategory;
  parseStatus: KnowledgeParseStatus;
  extractPath?: string;
  parseError?: string;
}

export interface KnowledgeMount {
  nodeIds: string[];
}

export interface CourseProjectKnowledge {
  mount: KnowledgeMount;
  /** Optional: node IDs excluded per chapter from the course mount */
  chapterExclusions?: Record<string, string[]>;
}

export type PlanOperation =
  | { op: 'mkdir'; parentId: string | null; name: string; tempId: string }
  | { op: 'move'; nodeId: string; newParentId: string | null; newName?: string }
  | { op: 'rename'; nodeId: string; newName: string }
  | { op: 'delete'; nodeId: string }
  | { op: 'assign'; tempFileId: string; parentId: string | null; name: string }
  | { op: 'remove'; nodeId: string };

export interface AiPlanProposal {
  id: string;
  status: 'pending' | 'applied' | 'discarded';
  summary: string;
  operations: PlanOperation[];
  createdAt: string;
  expiresAt: string;
  /** Batch import staging directory under uploads-staging/ */
  stagingUploadId?: string;
}

export interface KnowledgeTreeDocument {
  revision: number;
  nodes: KnowledgeNode[];
}

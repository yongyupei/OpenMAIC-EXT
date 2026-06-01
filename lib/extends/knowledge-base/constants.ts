/**
 * @extends-from lib/knowledge-base/constants.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import path from 'path';

export const DEFAULT_KB_ID = 'default';
export const KNOWLEDGE_BASE_DIR = path.join(process.cwd(), 'data', 'knowledge-base');
export const KNOWLEDGE_BASE_MAX_FILE_BYTES = 50 * 1024 * 1024;
export const KNOWLEDGE_REFERENCE_MAX_CHARS = 6_000;
export const KNOWLEDGE_PROPOSAL_TTL_MS = 24 * 60 * 60 * 1000;

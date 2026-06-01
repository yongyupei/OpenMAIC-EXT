/**
 * Restore upstream OpenMAIC app/api route files that were replaced by fork bridges.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UP = path.resolve(ROOT, '../OpenMAIC');

const RESTORE_FROM_UPSTREAM = [
  'app/api/classroom/route.ts',
  'app/api/generate/scene-actions/route.ts',
  'app/api/generate/scene-content/route.ts',
  'app/api/generate/scene-outlines-stream/route.ts',
  'app/api/generate/tts/route.ts',
  'app/api/generate-classroom/route.ts',
  'app/api/generate-classroom/[jobId]/route.ts',
  'app/api/transcription/route.ts',
];

/** @type {string[]} */
const restored = [];

for (const rel of RESTORE_FROM_UPSTREAM) {
  const src = path.join(UP, rel);
  const dest = path.join(ROOT, rel);
  if (!fs.existsSync(src)) {
    console.warn('skip missing upstream', rel);
    continue;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  restored.push(rel);
}

console.log(JSON.stringify({ restored }, null, 2));

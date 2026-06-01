/**
 * Rewrite fork client URLs from mirror paths (/api/teacher/...) to /api/extends/...
 * Run after sync-api-bridges.mjs. Scopes: lib/extends, components/extends, app/extends, tests/extends, e2e/extends
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SCAN_DIRS = [
  'lib/extends',
  'components/extends',
  'app/extends',
  'tests/extends',
  'e2e/extends',
];

/** Longest first so /api/generate-classroom wins over partial matches. */
const URL_REPLACEMENTS = [
  ['/api/generate/scene-outlines-stream', '/api/extends/generate/scene-outlines-stream'],
  ['/api/generate/scene-content', '/api/extends/generate/scene-content'],
  ['/api/generate/scene-actions', '/api/extends/generate/scene-actions'],
  ['/api/generate-classroom', '/api/extends/generate-classroom'],
  ['/api/export-video', '/api/extends/export-video'],
  ['/api/knowledge-base', '/api/extends/knowledge-base'],
  ['/api/slide-templates', '/api/extends/slide-templates'],
  ['/api/parse-document', '/api/extends/parse-document'],
  ['/api/transcription', '/api/extends/transcription'],
  ['/api/fetch-url', '/api/extends/fetch-url'],
  ['/api/teacher', '/api/extends/teacher'],
];

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, files);
    else if (/\.(tsx?|jsx?|mjs)$/.test(name)) files.push(full);
  }
  return files;
}

function migrateFile(filePath) {
  let text = fs.readFileSync(filePath, 'utf8');
  const original = text;

  for (const [from, to] of URL_REPLACEMENTS) {
    text = text.split(from).join(to);
  }

  // Fork PUT persist — upstream GET/POST remain /api/classroom
  text = text.replace(
    /fetch\(\s*['`]\/api\/classroom['`]\s*,\s*\{\s*method:\s*['"]PUT['"]/g,
    "fetch('/api/extends/classroom', { method: 'PUT'",
  );

  if (text !== original) {
    fs.writeFileSync(filePath, text, 'utf8');
    return true;
  }
  return false;
}

/** @type {string[]} */
const updated = [];
for (const dir of SCAN_DIRS) {
  for (const file of walk(path.join(ROOT, dir))) {
    if (migrateFile(file)) updated.push(path.relative(ROOT, file).replace(/\\/g, '/'));
  }
}

console.log(JSON.stringify({ updated: updated.length, files: updated }, null, 2));

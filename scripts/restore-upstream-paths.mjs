/**
 * Restore all upstream business paths from ../OpenMAIC.
 * Skips app/api/* bridge files (regenerate via sync-api-bridges.mjs).
 * Removes fork-only files at upstream paths that OpenMAIC does not have.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UP = path.resolve(ROOT, '../OpenMAIC');

const IGNORE = new Set([
  'node_modules',
  '.next',
  '.git',
  'data',
  'coverage',
  '.cursor',
  '.qoder',
  '.superpowers',
  'dist',
]);

const SCAN_ROOTS = ['app', 'components', 'lib', 'configs', 'tests', 'e2e', 'public'];

function hashFile(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function isBridge(text) {
  return (
    text.includes('Fork API bridge') || /^export \* from '@app-extends\/api\//m.test(text)
  );
}

function walk(dir, base, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (IGNORE.has(name)) continue;
    const rel = base ? `${base}/${name}` : name;
    if (rel.split('/').includes('extends')) continue;
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, rel, out);
    else out.push(rel);
  }
  return out;
}

function copyFromUpstream(rel) {
  const src = path.join(UP, rel);
  const dest = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function removeFile(rel) {
  const dest = path.join(ROOT, rel);
  if (!fs.existsSync(dest)) return;
  fs.unlinkSync(dest);
  let dir = path.dirname(dest);
  while (dir.startsWith(ROOT) && dir !== ROOT) {
    if (fs.readdirSync(dir).length > 0) break;
    fs.rmdirSync(dir);
    dir = path.dirname(dir);
  }
}

/** @type {string[]} */
const restored = [];
/** @type {string[]} */
const removed = [];

for (const root of SCAN_ROOTS) {
  for (const rel of walk(path.join(UP, root), root)) {
    const up = path.join(UP, rel);
    const wt = path.join(ROOT, rel);
    if (!fs.existsSync(wt)) {
      copyFromUpstream(rel);
      restored.push(`${rel} (was missing)`);
      continue;
    }
    if (hashFile(up) === hashFile(wt)) continue;
    if (rel.startsWith('app/api/') && isBridge(fs.readFileSync(wt, 'utf8'))) continue;
    copyFromUpstream(rel);
    restored.push(rel);
  }
}

for (const root of SCAN_ROOTS) {
  for (const rel of walk(path.join(ROOT, root), root)) {
    if (rel.startsWith('app/api/')) continue;
    if (fs.existsSync(path.join(UP, rel))) continue;
    removeFile(rel);
    removed.push(rel);
  }
}

console.log(JSON.stringify({ restored: restored.length, removed: removed.length }, null, 2));
if (restored.length) {
  console.log('\nRestored:');
  restored.forEach((r) => console.log(' ', r));
}
if (removed.length) {
  console.log('\nRemoved fork-only upstream paths:');
  removed.forEach((r) => console.log(' ', r));
}

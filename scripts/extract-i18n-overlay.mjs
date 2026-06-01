/**
 * Build delta locale overlays with identical key paths across all locales.
 * Paths come from en-US fork vs upstream diff; values from each locale's fork snapshot.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UPSTREAM = path.join(ROOT, 'lib/i18n/locales');
const FORK_FULL = path.join(ROOT, 'lib/extends/i18n/locales');
const OUT = path.join(ROOT, 'lib/extends/i18n/overlays');
const SOURCE = 'en-US.json';

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function diffOverlay(base, fork) {
  if (!isPlainObject(fork)) return fork === base ? undefined : fork;
  const out = {};
  for (const [key, forkVal] of Object.entries(fork)) {
    const baseVal = base?.[key];
    if (isPlainObject(forkVal)) {
      const child = diffOverlay(baseVal, forkVal);
      if (child !== undefined && (isPlainObject(child) ? Object.keys(child).length > 0 : true)) {
        out[key] = child;
      }
    } else if (forkVal !== baseVal) {
      out[key] = forkVal;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function collectLeafPaths(value, keyPath = '', paths = []) {
  if (!isPlainObject(value)) {
    if (keyPath) paths.push(keyPath);
    return paths;
  }
  for (const [key, child] of Object.entries(value)) {
    collectLeafPaths(child, keyPath ? `${keyPath}.${key}` : key, paths);
  }
  return paths;
}

function getAtPath(obj, keyPath) {
  return keyPath.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function setAtPath(obj, keyPath, value) {
  const parts = keyPath.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (!isPlainObject(cur[key])) cur[key] = {};
    cur = cur[key];
  }
  cur[parts[parts.length - 1]] = value;
}

function buildOverlayFromPaths(forkRoot, paths) {
  const out = {};
  for (const keyPath of paths) {
    const value = getAtPath(forkRoot, keyPath);
    if (value === undefined) {
      throw new Error(`Missing overlay key in ${SOURCE} fork snapshot: ${keyPath}`);
    }
    setAtPath(out, keyPath, value);
  }
  return out;
}

fs.mkdirSync(OUT, { recursive: true });

const enBase = JSON.parse(fs.readFileSync(path.join(UPSTREAM, SOURCE), 'utf8'));
const enFork = JSON.parse(fs.readFileSync(path.join(FORK_FULL, SOURCE), 'utf8'));
const enOverlay = diffOverlay(enBase, enFork) ?? {};
const paths = collectLeafPaths(enOverlay).sort();

fs.writeFileSync(path.join(OUT, SOURCE), `${JSON.stringify(enOverlay, null, 2)}\n`, 'utf8');
console.log(SOURCE, paths.length, 'leaf keys');

for (const name of fs.readdirSync(FORK_FULL).filter((n) => n.endsWith('.json') && n !== SOURCE)) {
  const fork = JSON.parse(fs.readFileSync(path.join(FORK_FULL, name), 'utf8'));
  const overlay = buildOverlayFromPaths(fork, paths);
  fs.writeFileSync(path.join(OUT, name), `${JSON.stringify(overlay, null, 2)}\n`, 'utf8');
  console.log(name, paths.length, 'leaf keys');
}

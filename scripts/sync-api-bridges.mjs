/**
 * Create app/api bridge route.ts files that re-export app/extends/api handlers.
 *
 * - Default: app/api/extends/{path} → /api/extends/{path} (all fork APIs)
 * - Optional `apiMirrorPrefix` in fork-aliases.json keeps mirror bridges at app/api/{module}/...
 *   (discouraged; prefer empty apiMirrorPrefix)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT_API = path.join(ROOT, 'app/extends/api');
const FORK_ALIASES_PATH = path.join(ROOT, 'extends/fork-aliases.json');

const BRIDGE_HEADER = (implPath, regenCmd) => `/**
 * Fork API bridge — implementation: app/extends/api/${implPath}
 * Regenerate: ${regenCmd}
 */
`;

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, files);
    else if (name === 'route.ts') files.push(full);
  }
  return files;
}

function isBridgeFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const text = fs.readFileSync(filePath, 'utf8');
  return text.includes('Fork API bridge') || /^export \* from '@app-extends\/api\//m.test(text);
}

function removeBridgeTree(apiRoutePath) {
  if (!fs.existsSync(apiRoutePath)) return;
  if (fs.statSync(apiRoutePath).isFile()) {
    if (isBridgeFile(apiRoutePath)) fs.unlinkSync(apiRoutePath);
    return;
  }
  for (const name of fs.readdirSync(apiRoutePath)) {
    removeBridgeTree(path.join(apiRoutePath, name));
  }
  if (fs.existsSync(apiRoutePath) && fs.readdirSync(apiRoutePath).length === 0) {
    fs.rmdirSync(apiRoutePath);
  }
}

function pruneEmptyDirs(dir) {
  if (!dir.startsWith(ROOT) || dir === ROOT) return;
  if (!fs.existsSync(dir)) return;
  if (fs.readdirSync(dir).length > 0) return;
  fs.rmdirSync(dir);
  pruneEmptyDirs(path.dirname(dir));
}

const forkConfig = JSON.parse(fs.readFileSync(FORK_ALIASES_PATH, 'utf8'));
/** @deprecated use apiMirrorPrefix; kept for one release of scripts reading old config */
const legacyExtendsPrefix = new Set(forkConfig.apiExtendsPrefix ?? []);
const mirrorPrefix = new Set(forkConfig.apiMirrorPrefix ?? []);

for (const extRoute of walk(EXT_API)) {
  if (extRoute.includes(`${path.sep}health${path.sep}`)) continue;

  const rel = path.relative(EXT_API, extRoute).replace(/\\/g, '/');
  const topLevel = rel.split('/')[0];
  const implPath = rel.replace(/\/route\.ts$/, '');
  const importPath = `@app-extends/api/${implPath}/route`;

  const useExtendsPrefix = legacyExtendsPrefix.has(topLevel) || !mirrorPrefix.has(topLevel);
  const apiRoute = useExtendsPrefix
    ? path.join(ROOT, 'app/api/extends', rel)
    : path.join(ROOT, 'app/api', rel);

  fs.mkdirSync(path.dirname(apiRoute), { recursive: true });
  const contents = `${BRIDGE_HEADER(implPath, 'node scripts/sync-api-bridges.mjs')}export * from '${importPath}';
`;
  fs.writeFileSync(apiRoute, contents, 'utf8');
  console.log('bridge', useExtendsPrefix ? `extends/${rel}` : rel);

  if (useExtendsPrefix) {
    const staleRoute = path.join(ROOT, 'app/api', rel);
    if (fs.existsSync(staleRoute) && isBridgeFile(staleRoute)) {
      fs.unlinkSync(staleRoute);
      pruneEmptyDirs(path.dirname(staleRoute));
      console.log('removed stale bridge', rel);
    }
  }
}

// Remove stale mirror bridges for modules now served under /api/extends/
const allTopLevels = new Set(
  walk(EXT_API).map((f) => path.relative(EXT_API, f).replace(/\\/g, '/').split('/')[0]),
);
for (const moduleName of allTopLevels) {
  if (mirrorPrefix.has(moduleName)) continue;
  const legacyDir = path.join(ROOT, 'app/api', moduleName);
  removeBridgeTree(legacyDir);
  pruneEmptyDirs(legacyDir);
}

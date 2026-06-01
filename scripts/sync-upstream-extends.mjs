/**
 * Bidirectional sync with upstream OpenMAIC:
 * - Missing in fork (upstream has, fork lacks) → copy from upstream
 * - Extra in fork (fork has, upstream lacks) → move to extends mirrors + alias/rewrite
 * - Modified (both exist, differ) → fork copy to extends, restore upstream at path + alias
 *
 * Usage:
 *   node scripts/sync-upstream-extends.mjs --dry-run
 *   node scripts/sync-upstream-extends.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UPSTREAM = path.resolve(ROOT, '../OpenMAIC');
const FORK_ALIASES_PATH = path.join(ROOT, 'extends/fork-aliases.json');

const SCAN_ROOTS = ['app', 'components', 'lib', 'configs', 'tests', 'e2e', 'public'];

const IGNORE_PARTS = new Set([
  'node_modules',
  '.next',
  '.git',
  'data',
  '.superpowers',
  'dist',
  'coverage',
  '.cursor',
  '.qoder',
]);

/** Keep at upstream path — bridges / fork tooling. */
const KEEP_AT_UPSTREAM_PATH = new Set([
  'app/api/classroom/route.ts',
]);

const KEEP_PREFIXES = ['scripts/'];

const BRIDGE_MARK = 'Fork API bridge';

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeJson(p, data) {
  fs.writeFileSync(p, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function shouldSkip(relPosix) {
  const parts = relPosix.split('/');
  if (parts.includes('extends')) return true;
  return parts.some((p) => IGNORE_PARTS.has(p));
}

function toExtendsPath(relPosix) {
  const parts = relPosix.split('/');
  const root = parts[0];
  if (!SCAN_ROOTS.includes(root)) return null;
  return path.join(root, 'extends', ...parts.slice(1)).replace(/\\/g, '/');
}

function ensureDirForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function copyFile(src, dest) {
  ensureDirForFile(dest);
  fs.copyFileSync(src, dest);
}

function isBridgeFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const text = fs.readFileSync(filePath, 'utf8');
  return text.includes(BRIDGE_MARK) || /^export \* from '@app-extends\/api\//m.test(text);
}

function shouldKeepAtUpstreamPath(rel) {
  if (KEEP_AT_UPSTREAM_PATH.has(rel)) return true;
  if (rel.startsWith('app/api/extends/')) return true;
  return KEEP_PREFIXES.some((p) => rel.startsWith(p));
}

function headerComment(upstreamRel, forkBranch) {
  return `/**
 * @extends-from ${upstreamRel}
 * @fork-branch ${forkBranch}
 */
`;
}

function prependHeaderIfMissing(filePath, upstreamRel, forkBranch) {
  const text = fs.readFileSync(filePath, 'utf8');
  if (text.includes('@extends-from')) return;
  fs.writeFileSync(filePath, headerComment(upstreamRel, forkBranch) + text, 'utf8');
}

function* walkAll(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) yield* walkAll(full);
    else yield full;
  }
}

function collectFiles(baseDir, rootName) {
  const files = new Set();
  const rootPath = path.join(baseDir, rootName);
  if (!fs.existsSync(rootPath)) return files;
  for (const abs of walkAll(rootPath)) {
    const rel = path.relative(baseDir, abs).replace(/\\/g, '/');
    if (shouldSkip(rel)) continue;
    files.add(rel);
  }
  return files;
}

function allTrackedFiles(baseDir) {
  const files = new Set();
  for (const root of SCAN_ROOTS) {
    for (const rel of collectFiles(baseDir, root)) files.add(rel);
  }
  return files;
}

function filesEqual(a, b) {
  return fs.readFileSync(a).compare(fs.readFileSync(b)) === 0;
}

function pageRewrite(extRel) {
  const m = extRel.match(/^app\/extends\/(.+)\/page\.tsx$/);
  if (!m) return null;
  return { source: `/${m[1]}`, destination: `/extends/${m[1]}` };
}

function pruneEmptyDirs(dir) {
  if (!dir.startsWith(ROOT) || dir === ROOT) return;
  if (!fs.existsSync(dir)) return;
  if (fs.readdirSync(dir).length > 0) return;
  fs.rmdirSync(dir);
  pruneEmptyDirs(path.dirname(dir));
}

function main() {
  const apply = process.argv.includes('--apply');
  const dryRun = !apply;

  if (!fs.existsSync(UPSTREAM)) {
    console.error('Upstream not found:', UPSTREAM);
    process.exit(1);
  }

  const forkConfig = readJson(FORK_ALIASES_PATH);
  const aliases = { ...forkConfig.aliases };
  const rewrites = [...(forkConfig.rewrites ?? [])];
  const forkBranch = forkConfig.forkBranch ?? 'fork';

  const upFiles = allTrackedFiles(UPSTREAM);
  const forkFiles = allTrackedFiles(ROOT);

  const missingInFork = [...upFiles].filter((f) => !forkFiles.has(f)).sort();
  const extraInFork = [...forkFiles].filter((f) => !upFiles.has(f)).sort();
  const common = [...forkFiles].filter((f) => upFiles.has(f));

  const modified = common.filter(
    (rel) => !filesEqual(path.join(ROOT, rel), path.join(UPSTREAM, rel)),
  );

  const plan = {
    copyFromUpstream: [],
    migrateExtra: [],
    syncModified: [],
    skipKeep: [],
  };

  const log = (msg) => console.log(dryRun ? `[dry-run] ${msg}` : msg);

  for (const rel of missingInFork) {
    plan.copyFromUpstream.push(rel);
    log(`copy from upstream → ${rel}`);
    if (apply) copyFile(path.join(UPSTREAM, rel), path.join(ROOT, rel));
  }

  for (const rel of extraInFork) {
    if (shouldKeepAtUpstreamPath(rel)) {
      plan.skipKeep.push(rel);
      continue;
    }
    if (rel.startsWith('app/api/') && isBridgeFile(path.join(ROOT, rel))) {
      plan.skipKeep.push(rel);
      continue;
    }

    const extRel = toExtendsPath(rel);
    if (!extRel) {
      plan.skipKeep.push(rel);
      continue;
    }

    const forkFile = path.join(ROOT, rel);
    const extFile = path.join(ROOT, extRel);
    const aliasKey = `@/${rel}`;

    if (fs.existsSync(extFile)) {
      plan.skipKeep.push(`${rel} (extends copy exists)`);
      if (apply && fs.existsSync(forkFile) && !isBridgeFile(forkFile)) {
        fs.unlinkSync(forkFile);
        pruneEmptyDirs(path.dirname(forkFile));
      }
      continue;
    }

    plan.migrateExtra.push(rel);
    log(`move extra → ${extRel}`);
    if (apply) {
      copyFile(forkFile, extFile);
      prependHeaderIfMissing(extFile, rel, forkBranch);
      fs.unlinkSync(forkFile);
      pruneEmptyDirs(path.dirname(forkFile));
    }

    if (rel.startsWith('app/') && !rel.startsWith('app/api/')) {
      const rewrite = pageRewrite(extRel);
      if (rewrite && !rewrites.some((r) => r.source === rewrite.source)) {
        rewrites.push(rewrite);
      }
    } else if (!rel.startsWith('app/api/') && !aliases[aliasKey]) {
      aliases[aliasKey] = `./${extRel}`;
    }
  }

  for (const rel of modified) {
    if (shouldKeepAtUpstreamPath(rel)) continue;
    if (rel.startsWith('app/api/') && isBridgeFile(path.join(ROOT, rel))) continue;

    const extRel = toExtendsPath(rel);
    if (!extRel) continue;

    plan.syncModified.push(rel);
    log(`sync modified: fork → ${extRel}, restore upstream ${rel}`);
    if (apply) {
      copyFile(path.join(ROOT, rel), path.join(ROOT, extRel));
      prependHeaderIfMissing(path.join(ROOT, extRel), rel, forkBranch);
      copyFile(path.join(UPSTREAM, rel), path.join(ROOT, rel));
    }

    const aliasKey = `@/${rel}`;
    if (!aliases[aliasKey]) aliases[aliasKey] = `./${extRel}`;
  }

  if (apply) {
    writeJson(FORK_ALIASES_PATH, { ...forkConfig, aliases, rewrites });
  }

  writeJson(path.join(ROOT, 'extends/_sync-plan.json'), {
    copyFromUpstream: plan.copyFromUpstream,
    migrateExtra: plan.migrateExtra,
    syncModified: plan.syncModified,
    skipKeep: plan.skipKeep,
  });

  console.log(
    JSON.stringify(
      {
        dryRun,
        copyFromUpstream: plan.copyFromUpstream.length,
        migrateExtra: plan.migrateExtra.length,
        syncModified: plan.syncModified.length,
        skipKeep: plan.skipKeep.length,
      },
      null,
      2,
    ),
  );

  if (apply) {
    console.log('\nRun:');
    console.log('  node scripts/sync-fork-tsconfig-paths.mjs');
    console.log('  node scripts/sync-api-bridges.mjs');
  }
}

main();

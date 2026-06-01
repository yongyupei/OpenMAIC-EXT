/**
 * Migrate fork diffs from upstream paths into extends mirrors.
 *
 * Usage:
 *   node scripts/migrate-fork-to-extends.mjs --dry-run
 *   node scripts/migrate-fork-to-extends.mjs --apply
 *
 * Requires upstream clone at ../OpenMAIC (sibling of open-maic).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UPSTREAM = path.resolve(ROOT, '../OpenMAIC');
const FORK_ALIASES_PATH = path.join(ROOT, 'extends/fork-aliases.json');

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

const SCAN_ROOTS = ['app', 'components', 'lib', 'configs', 'tests', 'e2e', 'public'];

const ALLOW_DIFF = new Set(['app/api/classroom/route.ts']);

const I18N_LOCALE_RESTORE = /^lib\/i18n\/locales\/[a-z]{2}-[A-Z]{2}\.json$/;

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

function isBridgeFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const text = fs.readFileSync(filePath, 'utf8');
  return text.includes(BRIDGE_MARK) || /^export \* from '@app-extends\/api\//m.test(text);
}

function* walkAll(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) yield* walkAll(full);
    else yield full;
  }
}

function walkFiles(rootDir, rootName) {
  const out = [];
  if (!fs.existsSync(rootDir)) return out;
  for (const abs of walkAll(rootDir)) {
    const rel = path.relative(path.join(ROOT, rootName), abs).replace(/\\/g, '/');
    out.push(`${rootName}/${rel}`);
  }
  return out;
}

function upstreamExists(relPosix) {
  return fs.existsSync(path.join(UPSTREAM, relPosix));
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

  const aliasByRel = new Map(
    Object.entries(aliases).map(([k, v]) => [k.replace(/^@\//, ''), v.replace(/^\.\//, '')]),
  );

  const allForkFiles = [];
  for (const root of SCAN_ROOTS) {
    for (const rel of walkFiles(path.join(ROOT, root), root)) {
      if (shouldSkip(rel)) continue;
      allForkFiles.push(rel);
    }
  }

  const plan = {
    restoreI18nLocales: [],
    copyToExtendsAndRestore: [],
    moveToExtends: [],
    deleteUpstreamCopy: [],
    skipBridge: [],
    addAliases: [],
    addRewrites: [],
  };

  const log = (msg) => console.log(dryRun ? `[dry-run] ${msg}` : msg);

  for (const rel of allForkFiles) {
    if (ALLOW_DIFF.has(rel)) continue;

    const forkFile = path.join(ROOT, rel);
    const extRel = toExtendsPath(rel);
    const extFile = extRel ? path.join(ROOT, extRel) : null;
    const aliasTarget = aliasByRel.get(rel);
    const hasUpstream = upstreamExists(rel);

    if (I18N_LOCALE_RESTORE.test(rel)) {
      plan.restoreI18nLocales.push(rel);
      continue;
    }

    if (rel.startsWith('app/api/') && isBridgeFile(forkFile)) {
      plan.skipBridge.push(rel);
      continue;
    }

    // Already aliased to extends: canonical copy lives in extends/
    if (aliasTarget && fs.existsSync(path.join(ROOT, aliasTarget))) {
      if (hasUpstream) {
        plan.deleteUpstreamCopy.push({ rel, action: 'restore-upstream-original' });
      } else {
        plan.deleteUpstreamCopy.push({ rel, action: 'remove-fork-only-duplicate' });
      }
      continue;
    }

    if (hasUpstream) {
      const upFile = path.join(UPSTREAM, rel);
      if (fs.readFileSync(forkFile).compare(fs.readFileSync(upFile)) === 0) continue;
      if (extRel) plan.copyToExtendsAndRestore.push(rel);
      continue;
    }

    // fork-only
    if (!extRel) continue;
    if (extFile && fs.existsSync(extFile)) {
      plan.deleteUpstreamCopy.push({ rel, action: 'remove-fork-only-duplicate' });
      continue;
    }
    plan.moveToExtends.push(rel);
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        restoreI18nLocales: plan.restoreI18nLocales.length,
        copyToExtendsAndRestore: plan.copyToExtendsAndRestore.length,
        moveToExtends: plan.moveToExtends.length,
        deleteUpstreamCopy: plan.deleteUpstreamCopy.length,
        skipBridge: plan.skipBridge.length,
      },
      null,
      2,
    ),
  );

  for (const rel of plan.restoreI18nLocales) {
    log(`restore i18n upstream ${rel}`);
    if (apply) copyFile(path.join(UPSTREAM, rel), path.join(ROOT, rel));
  }

  for (const rel of plan.copyToExtendsAndRestore) {
    const extRel = toExtendsPath(rel);
    const forkFile = path.join(ROOT, rel);
    const extFile = path.join(ROOT, extRel);
    const aliasKey = `@/${rel}`;

    log(`copy fork -> ${extRel}, restore upstream ${rel}`);
    if (apply) {
      copyFile(forkFile, extFile);
      prependHeaderIfMissing(extFile, rel, forkBranch);
      copyFile(path.join(UPSTREAM, rel), forkFile);
    }
    if (!aliases[aliasKey]) {
      aliases[aliasKey] = `./${extRel}`;
      plan.addAliases.push({ key: aliasKey, target: `./${extRel}` });
    }
  }

  for (const rel of plan.moveToExtends) {
    const extRel = toExtendsPath(rel);
    const forkFile = path.join(ROOT, rel);
    const extFile = path.join(ROOT, extRel);
    const aliasKey = `@/${rel}`;

    log(`move ${rel} -> ${extRel}`);
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
        plan.addRewrites.push(rewrite);
      }
    } else if (!rel.startsWith('app/api/') && !aliases[aliasKey]) {
      aliases[aliasKey] = `./${extRel}`;
      plan.addAliases.push({ key: aliasKey, target: `./${extRel}` });
    }
  }

  for (const { rel, action } of plan.deleteUpstreamCopy) {
    const forkFile = path.join(ROOT, rel);
    log(`${action} ${rel}`);
    if (apply) {
      if (action === 'restore-upstream-original') {
        copyFile(path.join(UPSTREAM, rel), forkFile);
      } else if (fs.existsSync(forkFile)) {
        fs.unlinkSync(forkFile);
        pruneEmptyDirs(path.dirname(forkFile));
      }
    }
  }

  if (apply) {
    writeJson(FORK_ALIASES_PATH, { ...forkConfig, aliases, rewrites });
    console.log('Updated extends/fork-aliases.json');
  }

  writeJson(path.join(ROOT, 'extends/_migration-plan.json'), plan);
  console.log('Wrote extends/_migration-plan.json');

  if (apply) {
    console.log('\nRun:');
    console.log('  node scripts/sync-fork-tsconfig-paths.mjs');
    console.log('  node scripts/sync-api-bridges.mjs');
    console.log('  node scripts/extract-i18n-overlay.mjs');
  }
}

main();

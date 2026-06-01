import path from 'node:path';

/** New or isolated packages — safe for directory-level alias. */
const FORK_PREFIX_ROOTS = [
  'lib/slide-templates',
  // Partial forks (knowledge-base, design-workbench, lib/prompts, lib/knowledge-base) use
  // per-file entries in fork-aliases.json only — directory prefix shadows upstream-only files.
  'components/slide-templates',
];

/** @typedef {'absolute' | 'relative-posix'} ForkAliasPathFormat */

/**
 * Turbopack on Windows rejects absolute drive paths in resolveAlias
 * ("windows imports are not implemented yet"). Use posix-style paths
 * relative to the project root for Next.js; keep absolute for Vitest.
 *
 * @param {string} projectRoot
 * @param {string} targetPath absolute path or `./`-relative path
 * @param {ForkAliasPathFormat} format
 */
function formatAliasTarget(projectRoot, targetPath, format) {
  const absolute = path.isAbsolute(targetPath)
    ? targetPath
    : path.resolve(projectRoot, targetPath.replace(/^\.\//, ''));

  if (format === 'relative-posix') {
    const relative = path.relative(projectRoot, absolute);
    return `./${relative.split(path.sep).join('/')}`;
  }

  return absolute;
}

/** Build prefix aliases (longest first) + per-file aliases from fork-aliases.json. */
export function buildForkResolveAliases(projectRoot, fileAliases, options = {}) {
  /** @type {ForkAliasPathFormat} */
  const format = options.format ?? 'absolute';

  const prefix = Object.fromEntries(
    FORK_PREFIX_ROOTS.map((d) => {
      const [root, ...rest] = d.split('/');
      const rel = path.join(root, 'extends', ...rest);
      return [`@/${d}`, formatAliasTarget(projectRoot, rel, format)];
    }).sort((a, b) => b[0].length - a[0].length),
  );

  const files = Object.fromEntries(
    Object.entries(fileAliases)
      .filter(([key]) => !key.startsWith('@/app/') && key !== '@/app/page.tsx')
      .flatMap(([key, rel]) => {
        const withoutExt = key.replace(/\.(tsx?|jsx|json|md)$/, '');
        const target = formatAliasTarget(projectRoot, rel, format);
        // Do not alias parent dirs (e.g. @/lib/store) to index.ts — breaks sibling modules.
        return [[withoutExt, target]];
      }),
  );

  return { ...prefix, ...files };
}

/**
 * Exact-match barrel aliases for index.ts forks (e.g. `@/lib/store` → extends index).
 * Vite/webpack treat object keys as prefixes; use regex so `@/lib/store/canvas` is unaffected.
 */
export function buildForkExactBarrelAliases(projectRoot, fileAliases, options = {}) {
  /** @type {ForkAliasPathFormat} */
  const format = options.format ?? 'absolute';

  return Object.entries(fileAliases)
    .filter(([key]) => /\/index\.tsx?$/.test(key))
    .map(([key, rel]) => {
      const parent = key.replace(/\/index\.tsx?$/, '');
      return {
        find: new RegExp(`^${parent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
        replacement: formatAliasTarget(projectRoot, rel, format),
      };
    });
}

/**
 * Turbopack / webpack exact barrel aliases using `$` suffix (no RegExp keys).
 * `@/lib/store$` matches `@/lib/store` but not `@/lib/store/canvas`.
 */
export function buildForkExactBarrelAliasStrings(projectRoot, fileAliases, options = {}) {
  /** @type {ForkAliasPathFormat} */
  const format = options.format ?? 'absolute';

  return Object.fromEntries(
    Object.entries(fileAliases)
      .filter(([key]) => /\/index\.tsx?$/.test(key))
      .map(([key, rel]) => {
        const parent = key.replace(/\/index\.tsx?$/, '');
        return [`${parent}$`, formatAliasTarget(projectRoot, rel, format)];
      }),
  );
}

/**
 * TypeScript `compilerOptions.paths` entries mirroring fork resolve aliases.
 * Run `node scripts/sync-fork-tsconfig-paths.mjs` after editing fork-aliases.json.
 *
 * @param {string} projectRoot
 * @param {Record<string, string>} fileAliases
 * @returns {Record<string, string[]>}
 */
export function buildForkTsconfigPaths(projectRoot, fileAliases) {
  /** @type {Record<string, string[]>} */
  const paths = {};

  for (const d of FORK_PREFIX_ROOTS) {
    const [root, ...rest] = d.split('/');
    const rel = `./${path.join(root, 'extends', ...rest).split(path.sep).join('/')}/*`;
    paths[`@/${d}/*`] = [rel];
  }

  for (const [key, rel] of Object.entries(fileAliases)) {
    if (key.startsWith('@/app/') || key === '@/app/page.tsx') continue;

    const withoutExt = key.replace(/\.(tsx?|jsx|json|md)$/, '');
    const target = `./${formatAliasTarget(projectRoot, rel, 'relative-posix')
      .replace(/^\.\//, '')
      .replace(/\.(tsx?|jsx|json|md)$/, '')}`;

    paths[withoutExt] = [target];

    if (/\/index\.tsx?$/.test(key)) {
      // TS paths are exact — safe to map `@/lib/store` without breaking `@/lib/store/canvas`.
      paths[key.replace(/\/index\.tsx?$/, '')] = [target];
    }
  }

  return paths;
}

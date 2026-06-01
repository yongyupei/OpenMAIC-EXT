/**
 * Sync fork module aliases from extends/fork-aliases.json into tsconfig.json paths.
 * Run after editing fork-aliases.json: node scripts/sync-fork-tsconfig-paths.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildForkTsconfigPaths } from '../extends/fork-alias-utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TSCONFIG_PATH = path.join(ROOT, 'tsconfig.json');
const FORK_ALIASES_PATH = path.join(ROOT, 'extends/fork-aliases.json');

/** @type {Record<string, string[]>} */
const BASE_PATHS = {
  '@/*': ['./*'],
  '@extends/*': ['./extends/*'],
  '@app-extends/*': ['./app/extends/*'],
  '@components-extends/*': ['./components/extends/*'],
  '@lib-extends/*': ['./lib/extends/*'],
  '@configs-extends/*': ['./configs/extends/*'],
};

const forkConfig = JSON.parse(fs.readFileSync(FORK_ALIASES_PATH, 'utf8'));
const forkPaths = buildForkTsconfigPaths(ROOT, forkConfig.aliases);

const tsconfig = JSON.parse(fs.readFileSync(TSCONFIG_PATH, 'utf8'));
tsconfig.compilerOptions.paths = {
  ...BASE_PATHS,
  ...forkPaths,
};

fs.writeFileSync(TSCONFIG_PATH, `${JSON.stringify(tsconfig, null, 2)}\n`, 'utf8');

console.log(
  `Updated tsconfig.json paths: ${Object.keys(BASE_PATHS).length} base + ${Object.keys(forkPaths).length} fork entries`,
);

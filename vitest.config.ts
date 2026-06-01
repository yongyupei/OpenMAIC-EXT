import { readFileSync } from 'node:fs';
import { resolve } from 'path';
import type { UserConfig } from 'vite';
import { defineConfig } from 'vitest/config';
import { buildForkExactBarrelAliases, buildForkResolveAliases } from './extends/fork-alias-utils.mjs';

const projectRoot = __dirname;
const forkConfig = JSON.parse(
  readFileSync(resolve(projectRoot, 'extends/fork-aliases.json'), 'utf8'),
) as { aliases: Record<string, string> };

const forkAliases = buildForkResolveAliases(projectRoot, forkConfig.aliases);
const forkBarrelAliases = buildForkExactBarrelAliases(projectRoot, forkConfig.aliases);

/** Upstream test files superseded by tests/extends mirrors (import aliases do not apply to vitest entry paths). */
const forkMirroredUpstreamTests = Object.keys(forkConfig.aliases)
  .filter((key) => key.startsWith('@/tests/'))
  .map((key) => key.slice(2));

const vitestResolve: NonNullable<UserConfig['resolve']> = {
  alias: [
    ...forkBarrelAliases,
    ...Object.entries(forkAliases).map(([find, replacement]) => ({ find, replacement })),
    { find: '@', replacement: resolve(projectRoot, '.') },
    { find: '@extends', replacement: resolve(projectRoot, 'extends') },
    { find: '@lib-extends', replacement: resolve(projectRoot, 'lib/extends') },
    { find: '@components-extends', replacement: resolve(projectRoot, 'components/extends') },
    { find: '@app-extends', replacement: resolve(projectRoot, 'app/extends') },
    { find: '@configs-extends', replacement: resolve(projectRoot, 'configs/extends') },
  ],
};

export default defineConfig({
  resolve: vitestResolve,
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: forkMirroredUpstreamTests,
    setupFiles: ['tests/setup-env.ts'],
  },
});

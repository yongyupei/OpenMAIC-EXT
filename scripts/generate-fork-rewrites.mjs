import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fork = JSON.parse(fs.readFileSync(path.join(ROOT, 'extends/fork-aliases.json'), 'utf8'));

/**
 * Page rewrites only. Fork APIs use app/api/extends/* bridges (see sync-api-bridges.mjs).
 */
const PAGE_REWRITES = [
  { source: '/dev/ai-traces/:path*', destination: '/extends/dev/ai-traces/:path*' },
  { source: '/dev/ai-traces', destination: '/extends/dev/ai-traces' },
  { source: '/knowledge-base', destination: '/extends/knowledge-base' },
  { source: '/slide-templates', destination: '/extends/slide-templates' },
  { source: '/home', destination: '/extends/home' },
  { source: '/teacher/:path*', destination: '/extends/teacher/:path*' },
];

const rewrites = [...PAGE_REWRITES].sort(
  (a, b) => b.source.split('/').filter(Boolean).length - a.source.split('/').filter(Boolean).length,
);

delete fork.aliases['@/app/page.tsx'];

fork.rewrites = rewrites;
fs.writeFileSync(path.join(ROOT, 'extends/fork-aliases.json'), JSON.stringify(fork, null, 2));
console.log(
  'rewrites:',
  rewrites.length,
  '(page only)',
  'aliases:',
  Object.keys(fork.aliases).length,
);

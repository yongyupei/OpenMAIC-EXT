import type { NextConfig } from 'next';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildForkExactBarrelAliasStrings, buildForkResolveAliases } from './extends/fork-alias-utils.mjs';

// Turbopack may infer the parent folder when sibling projects share lockfiles;
// pin the app root so CSS `@import "tailwindcss"` resolves correctly.
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const forkConfig = JSON.parse(
  readFileSync(path.join(projectRoot, 'extends/fork-aliases.json'), 'utf8'),
) as {
  aliases: Record<string, string>;
  rewrites: { source: string; destination: string }[];
};

const forkResolveAlias = {
  ...buildForkResolveAliases(projectRoot, forkConfig.aliases, {
    format: 'relative-posix',
  }),
  ...buildForkExactBarrelAliasStrings(projectRoot, forkConfig.aliases, {
    format: 'relative-posix',
  }),
  '@extends': './extends',
  '@lib-extends': './lib/extends',
  '@components-extends': './components/extends',
  '@app-extends': './app/extends',
  '@configs-extends': './configs/extends',
};

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
    resolveAlias: forkResolveAlias,
  },
  output: process.env.VERCEL ? undefined : 'standalone',
  transpilePackages: ['mathml2omml', 'pptxgenjs'],
  serverExternalPackages: [],
  experimental: {
    proxyClientMaxBodySize: '200mb',
  },
  async rewrites() {
    return forkConfig.rewrites;
  },
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      ...forkResolveAlias,
    };
    return config;
  },
  async headers() {
    const extraAncestors = process.env.ALLOWED_FRAME_ANCESTORS?.trim();
    const frameAncestors = extraAncestors ? `'self' ${extraAncestors}` : "'self'";

    return [
      {
        source: '/(.*)',
        headers: [
          // X-Frame-Options only supports SAMEORIGIN (no allow-list),
          // so we omit it when custom ancestors are configured.
          ...(!extraAncestors ? [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }] : []),
          {
            key: 'Content-Security-Policy',
            value: `frame-ancestors ${frameAncestors}`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;

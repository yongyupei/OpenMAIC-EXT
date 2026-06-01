/**
 * @extends-from lib/prompts/loader.ts
 * @fork-branch feat/html-slide-design-workbench
 *
 * Fork loader: prefers `lib/extends/prompts` templates/snippets, falls back to upstream `lib/prompts`.
 */
import fs from 'fs';
import path from 'path';

import { createLogger } from '@/lib/logger';

import type { LoadedPrompt, PromptId, SnippetId } from './types';

const log = createLogger('PromptLoader');

const EXT_PROMPTS_DIR = path.join(process.cwd(), 'lib', 'extends', 'prompts');
const UPSTREAM_PROMPTS_DIR = path.join(process.cwd(), 'lib', 'prompts');

function resolveSnippetPath(snippetId: SnippetId): string {
  const extPath = path.join(EXT_PROMPTS_DIR, 'snippets', `${snippetId}.md`);
  if (fs.existsSync(extPath)) return extPath;

  const upstreamPath = path.join(UPSTREAM_PROMPTS_DIR, 'snippets', `${snippetId}.md`);
  if (fs.existsSync(upstreamPath)) return upstreamPath;

  throw new Error(`Snippet not found: ${snippetId}`);
}

function readTemplatePart(promptId: PromptId, fileName: 'system.md' | 'user.md'): string | null {
  const extPath = path.join(EXT_PROMPTS_DIR, 'templates', promptId, fileName);
  if (fs.existsSync(extPath)) {
    return fs.readFileSync(extPath, 'utf-8').trim();
  }

  const upstreamPath = path.join(UPSTREAM_PROMPTS_DIR, 'templates', promptId, fileName);
  if (fs.existsSync(upstreamPath)) {
    return fs.readFileSync(upstreamPath, 'utf-8').trim();
  }

  return null;
}

export function loadSnippet(snippetId: SnippetId): string {
  try {
    const raw = fs.readFileSync(resolveSnippetPath(snippetId), 'utf-8').trim();
    return raw.replace(/^\/\*\*[\s\S]*?\*\/\s*/, '');
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Snippet not found:')) {
      throw error;
    }
    throw new Error(`Snippet not found: ${snippetId}`);
  }
}

export function processSnippets(template: string): string {
  return template.replace(/\{\{snippet:(\w[\w-]*)\}\}/g, (_, snippetId) => {
    return loadSnippet(snippetId as SnippetId);
  });
}

export function processConditionalBlocks(
  template: string,
  conditions: Record<string, unknown>,
): string {
  return template.replace(
    /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, conditionName: string, content: string) => {
      return conditions[conditionName] ? content : '';
    },
  );
}

export function loadPrompt(promptId: PromptId): LoadedPrompt | null {
  const systemRaw = readTemplatePart(promptId, 'system.md');
  if (!systemRaw) {
    log.error(`Failed to load prompt ${promptId}: system.md not found`);
    return null;
  }

  try {
    const systemPrompt = processSnippets(systemRaw);
    const userRaw = readTemplatePart(promptId, 'user.md');
    const userPromptTemplate = userRaw ? processSnippets(userRaw) : '';

    return {
      id: promptId,
      systemPrompt,
      userPromptTemplate,
    };
  } catch (error) {
    log.error(`Failed to load prompt ${promptId}:`, error);
    return null;
  }
}

export function interpolateVariables(template: string, variables: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = variables[key];
    if (value === undefined) return match;
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  });
}

export function buildPrompt(
  promptId: PromptId,
  variables: Record<string, unknown>,
): { system: string; user: string } | null {
  const prompt = loadPrompt(promptId);
  if (!prompt) return null;

  return {
    system: interpolateVariables(
      processConditionalBlocks(prompt.systemPrompt, variables),
      variables,
    ),
    user: interpolateVariables(
      processConditionalBlocks(prompt.userPromptTemplate, variables),
      variables,
    ),
  };
}

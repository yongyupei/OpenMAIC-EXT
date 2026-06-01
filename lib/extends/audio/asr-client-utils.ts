/**
 * Client-safe ASR provider selection (no Node-only imports).
 */

import { ASR_PROVIDERS } from '@/lib/audio/constants';
import type { ASRProviderId } from '@/lib/audio/types';
import { isCustomASRProvider } from '@/lib/audio/types';

export type AsrProviderConfigSlice = {
  apiKey?: string;
  baseUrl?: string;
  customDefaultBaseUrl?: string;
  enabled?: boolean;
  isServerConfigured?: boolean;
  modelId?: string;
};

const ISO639_TO_BCP47: Record<string, string> = {
  zh: 'zh-CN',
  en: 'en-US',
  ja: 'ja-JP',
  ko: 'ko-KR',
  de: 'de-DE',
  fr: 'fr-FR',
  es: 'es-ES',
  it: 'it-IT',
  pt: 'pt-BR',
  ru: 'ru-RU',
  ar: 'ar-SA',
  hi: 'hi-IN',
  auto: 'zh-CN',
};

/** Web Speech API expects BCP-47 tags (e.g. zh-CN), not Whisper ISO codes (e.g. zh). */
export function toBrowserSpeechLanguage(language: string): string {
  const trimmed = language.trim();
  if (!trimmed) return 'zh-CN';
  if (trimmed.includes('-')) return trimmed;
  return ISO639_TO_BCP47[trimmed] ?? trimmed;
}

const SERVER_ASR_PRIORITY: readonly ASRProviderId[] = [
  'openai-whisper',
  'qwen-asr',
  'lemonade-asr',
];

export function isServerAsrProviderUsable(
  providerId: string,
  configs: Record<string, AsrProviderConfigSlice | undefined>,
): boolean {
  if (providerId === 'browser-native') return false;

  const cfg = configs[providerId];
  if (cfg?.enabled === false) return false;

  const meta = ASR_PROVIDERS[providerId as keyof typeof ASR_PROVIDERS];
  if (!meta && !isCustomASRProvider(providerId)) return false;

  if (cfg?.isServerConfigured) return true;
  if (cfg?.apiKey?.trim()) return true;
  if (cfg?.baseUrl?.trim() || cfg?.customDefaultBaseUrl?.trim()) return true;

  return cfg !== undefined;
}

/** Optional fallback when browser Web Speech API fails (e.g. network). */
export function pickServerAsrFallback(
  configs: Record<string, AsrProviderConfigSlice | undefined>,
): ASRProviderId | null {
  for (const id of SERVER_ASR_PRIORITY) {
    if (isServerAsrProviderUsable(id, configs)) return id;
  }

  for (const id of Object.keys(configs)) {
    if (id === 'browser-native') continue;
    if (isCustomASRProvider(id) && isServerAsrProviderUsable(id, configs)) {
      return id as ASRProviderId;
    }
  }

  return null;
}

export function isBrowserSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function createBrowserSpeechRecognition(): SpeechRecognition | null {
  if (!isBrowserSpeechRecognitionSupported()) return null;
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  return new Ctor() as SpeechRecognition;
}

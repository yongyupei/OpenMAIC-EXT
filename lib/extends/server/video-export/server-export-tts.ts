/**
 * Server-side TTS availability for lecture video export.
 */
import { getServerTTSProviders } from '@/lib/server/provider-config';

/** True when at least one non-browser TTS provider is configured on the server (.env / YAML). */
export function serverCanGenerateExportNarration(): boolean {
  return Object.keys(getServerTTSProviders()).some((id) => id !== 'browser-native-tts');
}

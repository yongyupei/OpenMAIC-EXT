import type { TraceBusinessContext } from './trace-types';

const PREFIX = 'b64:';

function utf8ToBase64(value: string): string {
  if (typeof window === 'undefined' && typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'utf8').toString('base64');
  }
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToUtf8(value: string): string {
  if (typeof window === 'undefined' && typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'base64').toString('utf8');
  }
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Encode trace business context for HTTP headers (ASCII-safe). */
export function encodeTraceContextHeader(context: TraceBusinessContext): string {
  return `${PREFIX}${utf8ToBase64(JSON.stringify(context))}`;
}

/** Decode trace context from header; accepts legacy plain JSON for ASCII payloads. */
export function decodeTraceContextHeader(raw: string): TraceBusinessContext {
  try {
    const json = raw.startsWith(PREFIX) ? base64ToUtf8(raw.slice(PREFIX.length)) : raw;
    return JSON.parse(json) as TraceBusinessContext;
  } catch {
    return {};
  }
}

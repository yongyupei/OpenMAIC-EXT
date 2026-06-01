function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Deep-merge fork locale overlay onto upstream messages (overlay wins on conflict). */
export function deepMergeLocale(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = deepMergeLocale(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export async function loadMergedLocaleMessages(
  language: string,
): Promise<Record<string, unknown>> {
  const baseModule = await import(`@/lib/i18n/locales/${language}.json`);
  const base = (baseModule.default ?? baseModule) as Record<string, unknown>;

  try {
    // Relative path: Turbopack does not resolve dynamic `@lib-extends/*` imports.
    const overlayModule = await import(`../lib/extends/i18n/overlays/${language}.json`);
    const overlay = (overlayModule.default ?? overlayModule) as Record<string, unknown>;
    return deepMergeLocale(base, overlay);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[extends/i18n] overlay load failed for ${language}:`, error);
    }
    return base;
  }
}
